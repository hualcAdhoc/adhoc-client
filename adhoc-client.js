// Note window.adhoc contains the API.
// Only 5 calls are public to user app:
//   init(adhoc_app_track_id, client_id)
//   getCachedExperimentFlags()
//   getExperimentFlags(callback, callbackOnCache)
//   incrementStat(stat, value)
//   forceExperiment(qr_code)


(function(adhoc, document, window, undefined) {
	'use strict';

	var protocol = window.location.protocol === "https:" ? "https:" : "http:";
	var ADHOC_GETFLAGS_URL = protocol + '//api.appadhoc.com/optimizer/api/getflags.php';
	var ADHOC_FORCEEXP_URL = protocol + '//api.appadhoc.com/optimizer/api/forceexp.php';
	var ADHOC_TRACKING_URL = protocol + '//tracking.appadhoc.com:23462';

	// Canonicalize Date.now().
	Date.now = Date.now || function() {
	 	return new Date().getTime();
	};

	// Canonicalize JSON.stringify().
	JSON.stringify = JSON.stringify || function(obj) {
		var t = typeof (obj);
		if (t != "object" || obj === null) {
			if (t == "string") obj = '"'+obj+'"';
			return String(obj);
		} else {
			var n, v, json = [], arr = (obj && obj.constructor == Array);
			for (n in obj) {
				v = obj[n];
				t = typeof(v);
				if (t == "string") v = '"'+v+'"';
				else if (t == "object" && v !== null) v = JSON.stringify(v);
				json.push((arr ? "" : '"' + n + '":') + String(v));
			}
			return (arr ? "[" : "{") + String(json) + (arr ? "]" : "}");
		}
	};

	// Canonicalize JSON.parse().
	JSON.parse = JSON.parse || function(str) {
		return eval("(" + str + ")");
	};

	// Micro implementaiton of AJAX.
	var AJAX = function(url, data, callback) {
		var x = new XMLHttpRequest();
		if (callback != null) {
			x.onload = callback;
		}
		x.open("POST", url);
		x.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
		x.send(JSON.stringify(data));
	};

	// Micro JSONP implementation.
	var JSONP = function(url, data, callback) {
		url = url || '';
		data = data || {};
	 	callback = callback || function(){};

		// NOTE we assume urlencode is not needed.
		if (typeof data == 'object') {
			url += '?data=' + JSON.stringify(data);
		}

		// Allow parallel requests by time multiplexing.
		var timestamp = Date.now();
		var generatedFunction = 'jsonp' + Math.round(timestamp + Math.random() * 1000001)
		window[generatedFunction] = function(json) {
			//TODO: maybe compress the entire flag JSON obj into one cookie.
			//setCookie("ADHOC_FLAGS", encodeURIComponent(JSON.stringify(json)), 14);
			for (var k in json) {
				setCookie("ADHOC_FLAG_" + k, json[k], 14);
			}
			callback(json);
			delete window[generatedFunction];
		};

		// Generate callback JSONP requst URL.
		if (url.indexOf('?') === -1) {
		 	url = url+'?' ;
		} else {
		 	url = url+'&';
		}
		url = url + "callback=" + generatedFunction;

		// Generate JSONP script tag: requring head tag.
		var jsonpScript = document.createElement('script');
		jsonpScript.setAttribute("src", url);
		document.getElementsByTagName("head")[0].appendChild(jsonpScript);
	};

	var getCookie = function(cname) {
		var name = cname + "=";
		var ca = document.cookie.split(';');
		for(var i = 0; i < ca.length; i++) {
			var c = ca[i];
			while(c.charAt(0) == ' ') c = c.substring(1);
			if(c === cname) return c.substring(name.length, c.length);
		}
		return null;
	};

	var setCookie = function(cname, value, days) {
		var expires = "";
	  if (days) {
	    var date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
	    var expires = "; expires=" + date.toUTCString();
	  }
		var toset = cname + "=" + value + expires + "; path=/";
		document.cookie = toset;
	};

	var getCachedFlags = function() {
		//TODO: maybe compress the entire flags into one cookie.
		// var flags = getCookie("ADHOC_FLAGS") || "{}";
		// return JSON.parse(decodeURIComponent(flags));
		var flags = {};
		var ca = document.cookie.split(';');
		for(var i = 0; i < ca.length; i++) {
			var c = ca[i];
			while(c.charAt(0) == ' ') c = c.substring(1);
			if(c.indexOf('ADHOC_FLAG_') == 0) {
				//TODO: correctly handle string / boolean flags.
				var flag = c.substring(11, c.indexOf('='));
				var value = c.substring(c.indexOf('=') + 1, c.length);
				if (value === "false") {
					value = false;
				} else if (value === "true") {
					value = true;
				} else if (Number(value) != "NaN") {
					value = Number(value);
				}
				flags[flag] = value;
			}
		}
		return flags;
	};

	var getBrowserInfo = function() {
		var ua = navigator.userAgent, tem, M = ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || []; 
		if(/trident/i.test(M[1])) {
			tem = /\brv[ :]+(\d+)/g.exec(ua) || []; 
			return {
				n: 'IE',
				v: (tem[1] || '')
			};
		}
		if(M[1] === 'Chrome'){
			tem = ua.match(/\bOPR\/(\d+)/)
			if(tem != null) {
				return {
					n: 'Opera',
					v: tem[1]
				};
			}
		}
		M = M[2] ? [M[1], M[2]] : [navigator.appName, navigator.appVersion, '-?'];
		if((tem = ua.match(/version\/(\d+)/i)) != null) M.splice(1,1,tem[1]);
		return {
			n: M[0],  // n as name
			v: M[1]   // v as version
		};
	};

	var thisAdhoc = adhoc;

	thisAdhoc.init = function(appKey, clientId) {
		thisAdhoc.ak = appKey;  // ak as appKey
		// If App specifies client id, use it. Otherwise, use cookie for id.
		thisAdhoc.c = clientId || getCookie('ADHOC_MEMBERSHIP_CLIENT_ID');  // c as clientId
	}

	thisAdhoc.getCachedExperimentFlags = function() {
		return getCachedFlags();
	}

	thisAdhoc.getExperimentFlags = function(callback, callbackOnCache) {
	 	callback = callback || function(){};
	 	if(callbackOnCache && typeof(callbackOnCache) == 'function') {
			callbackOnCache(getCachedFlags());
		}

		var b = getBrowserInfo();
		var data = {
			adhoc_app_track_id: thisAdhoc.ak,
			event_type: 'GET_EXPERIMENT_FLAGS',
			timestamp: Date.now() / 1000,
			summary: {
				OS: b.n,
				OS_version: b.v
			}
		};
		// Note for a new client, we may not have client_id yet.
		if(thisAdhoc.c != null) {
			data.client_id = thisAdhoc.c;
		}

		JSONP(ADHOC_GETFLAGS_URL, data, callback);
	};

	thisAdhoc.incrementStat = function(stat, value) {
		var b = getBrowserInfo();
		var data = {
			adhoc_app_track_id: thisAdhoc.ak,
			client_id: thisAdhoc.c,
			event_type: 'REPORT_STAT',
			timestamp: Date.now() / 1000,
			summary: {
				OS: b.n,
				OS_version: b.v
			},
			stat_key: stat,
			stat_value: value
		}; 

		AJAX(ADHOC_TRACKING_URL, data, null);
	};

	thisAdhoc.forceExperiment = function(qr_code) {
		var data = {
			client_id: thisAdhoc.c,
			qr_code: qr_code
		};
		JSONP(ADHOC_FORCEEXP_URL, data, null);
	};

}((window.adhoc = typeof Object.create !== 'undefined' ? Object.create(null) : {}), document, window));