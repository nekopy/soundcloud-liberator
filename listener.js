'use strict';

var targetFormat = "https://cf-hls-media.sndcdn.com/media/*"

var soundMap = new Map();

browser.browserAction.onClicked.addListener((e) => {
	console.log(e.url);
	console.log("OH FUCK");
	if (!soundMap.has(e.url))
		return;
	browser.tabs.create({"active": true, "url": soundMap.get(e.url).url})
});


function updateMap(origin, highSample, url) {
	if (soundMap.has(origin)) {
		var soundEntry = soundMap.get(origin);
		if (soundEntry.highSample >= highSample) {
			return;
		}
	}
	var newEntry = {
		"highSample": highSample,
		"url": url
	};
	console.log("Registering new entry for origin ", origin);
	soundMap.set(origin, newEntry);
}


function parseMp3Url(trackUrl) {
	var retArray = [null, null]
	if (trackUrl.includes('playlist')) {
		return retArray;
	}
	var urlArray = trackUrl.split('/')
	var foundMedia = false
	for (var i = 0; i < urlArray.length; i++) {
		if (urlArray[i] == "media") {
			foundMedia = i
			break;
		}	
	}
	if (!foundMedia)
		return retArray;
	var highSample = Number(urlArray[foundMedia + 2]);
	console.log("high sample number is ", highSample)
	urlArray[foundMedia + 1] = "0"
	var downloadUrl = urlArray.join('/');
	return [highSample, downloadUrl];
}

function registerTrack(responseDetails) {
	var results = parseMp3Url(responseDetails.url)
	if (null == results[1])
		return;
	updateMap(responseDetails.originUrl, results[0], results[1]);
}

browser.webRequest.onCompleted.addListener(
	registerTrack,
	{urls: [targetFormat]}
);

