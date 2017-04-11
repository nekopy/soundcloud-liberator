'use strict';

var targetFormat = "https://cf-hls-media.sndcdn.com/media/*"
var clientID = null

var soundMap = new Map();


function getMP3TrackFromUrl(url) {
	var mp3Regex = /[a-zA-Z0-9]+\.128\.mp3/;
	return url.match(mp3Regex)[0];
}

function xhrForJSON(request, continuation) {
	var xhr = new XMLHttpRequest();
	
	xhr.addEventListener("load", () => {
		continuation(JSON.parse(xhr.responseText));
	});
	xhr.open("GET", request);
	xhr.send();
}

function resolveTrackId(currentUrl, resolve) {

	var resolveUrl = "https://api.soundcloud.com/resolve?url=" + currentUrl + "&client_id=" + clientID;
	xhrForJSON(resolveUrl, (response) => {
		resolve(response.id);
	});
}

function resolveStreamInfo(trackId, resolve) {
	var streamsUrl = "https://api.soundcloud.com/i1/tracks/" + trackId +"/streams?client_id=" + clientID;
	
	xhrForJSON(streamsUrl, (response) => {
		resolve(getMP3TrackFromUrl(response.hls_mp3_128_url));
	});	
}


browser.browserAction.onClicked.addListener((e) => {
	console.log(e.url);
	var testURL = e.url.search(/https:\/\/soundcloud\.com/);
	if (-1 == testURL)
		return;

	if (null == clientID)
		return;

	var gettingTrackId = new Promise((resolve, reject) => {
		resolveTrackId(e.url, resolve);	
	});
	gettingTrackId.then((trackId) => {
		console.log("track Id: ", trackId);
		var gettingStreamInfo = new Promise((resolve, reject) => {
			resolveStreamInfo(trackId, resolve);
		});
		gettingStreamInfo.then((mp3Track) => {
			console.log("Track is!!! ", mp3Track);
			if (soundMap.has(mp3Track))
				console.log(browser.tabs.create({"active": true, "url": soundMap.get(mp3Track).url}))
		});
	});
});


function updateMap(mp3Filename, highSample, url) {
	if (soundMap.has(mp3Filename)) {
		var soundEntry = soundMap.get(mp3Filename);
		if (soundEntry.highSample >= highSample) {
			return;
		}
	}
	var newEntry = {
		"highSample": highSample,
		"url": url
	};
	console.log("Registering new entry for mp3Filename ", mp3Filename);
	soundMap.set(mp3Filename, newEntry);
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
	var mp3Filename = getMP3TrackFromUrl(trackUrl);
	console.log("Filename is ", mp3Filename);
	var highSample = Number(urlArray[foundMedia + 2]);
	console.log("high sample number is ", highSample)
	urlArray[foundMedia + 1] = "0"
	var downloadUrl = urlArray.join('/');
	return [mp3Filename, highSample, downloadUrl];
}

function registerTrack(responseDetails) {
	var results = parseMp3Url(responseDetails.url)
	if (null == results[2])
		return;
	updateMap(results[0], results[1], results[2]);
}

browser.webRequest.onCompleted.addListener(
	registerTrack,
	{urls: [targetFormat]}
);


function getClientID(responseDetails) {
	clientID = responseDetails.url.split("client_id=")[1].split('&')[0];
	console.log("Client ID is ", clientID);
}

browser.webRequest.onCompleted.addListener(
	getClientID,
	{urls: ["https://api.soundcloud.com/i1/tracks/*"]}
);
