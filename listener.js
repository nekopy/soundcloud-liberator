'use strict';

const targetFormat = "https://cf-hls-media.sndcdn.com/media/*";
const playlistFormat = "https://cf-hls-media.sndcdn.com/playlist/*";
let clientID = null;

const soundMap = new Map();

// Given a URL, just pull out the the mp3 part and ignore the 
// cgi parameters and whatnot, and the path 
function getMP3TrackFromUrl(url) {
	const mp3Regex = /[a-zA-Z0-9]+\.128\.mp3/;
	return url.match(mp3Regex)[0];
}


// Peform an XHR request and return the content as a JSON object
function xhrForJSON(request, continuation) {
	const xhr = new XMLHttpRequest();
	
	xhr.addEventListener("load", () => {
		continuation(JSON.parse(xhr.responseText));
	});
	xhr.open("GET", request);
	xhr.send();
}

// Perform an XHR request and return the content as raw text
function xhrForText(request, continuation) {
	const xhr = new XMLHttpRequest();
	
	xhr.addEventListener("load", () => {
		continuation(xhr.responseText);
	});
	xhr.open("GET", request);
	xhr.send();
}


// Reads out a playlist and gives us the last entry, which ought to have 
// the highest sample number, since it's the last track
function parsePlaylistContent(currentUrl, resolve) {
	xhrForText(currentUrl, (response) => {
		const splits = response.split('#');
		let matchUrls = []
		for (let i = 0; i < splits.length; i++) {
			matchUrls = matchUrls.concat(splits[i].match(/http.*/))
		}
		const highestUrl = matchUrls.reverse()[1]
		
		resolve(highestUrl);
	});
}

// From the current URL, give us the corresponding Track ID
function resolveTrackId(currentUrl, resolve) {

	const resolveUrl = `https://api.soundcloud.com/resolve?url=${currentUrl}&client_id=${clientID}`;
	xhrForJSON(resolveUrl, (response) => {
		resolve(response.id);
	});
}


// Uses an unlisted API call to get the internal MP3 URL from a track ID
function resolveStreamInfo(trackId, resolve) {
	const streamsUrl = `https://api.soundcloud.com/i1/tracks/${trackId}/streams?client_id=${clientID}`;
	
	xhrForJSON(streamsUrl, (response) => {
		resolve(getMP3TrackFromUrl(response.hls_mp3_128_url));
	});	
}

// Add the filename with the highest sample number to the map, only if it's the
// highest sample number we've seen so far. This lets us figure out how 
// long the track is
function updateMap(mp3Filename, highSample, url) {
	if (soundMap.has(mp3Filename)) {
		const soundEntry = soundMap.get(mp3Filename);
		if (soundEntry.highSample >= highSample) {
			return;
		}
	}
	const newEntry = {
		"highSample": highSample,
		"url": url
	};
	console.log("Registering new entry for mp3Filename ", mp3Filename);
	soundMap.set(mp3Filename, newEntry);
}


// We wanna try and grab MP3 urls, and filter out things that aren't MP3 urls 
function parseMp3Url(trackUrl) {
	let retArray = [null, null]
	if (trackUrl.includes('playlist')) {
		return retArray;
	}
	const urlArray = trackUrl.split('/')
	let foundMedia = false
	for (let i = 0; i < urlArray.length; i++) {
		if (urlArray[i] == "media") {
			foundMedia = i
			break;
		}	
	}
	if (!foundMedia)
		return retArray;
	const mp3Filename = getMP3TrackFromUrl(trackUrl);
	console.log("Filename is ", mp3Filename);
	const highSample = Number(urlArray[foundMedia + 2]);
	console.log("high sample number is ", highSample)
	urlArray[foundMedia + 1] = "0"
	const downloadUrl = urlArray.join('/');
	return [mp3Filename, highSample, downloadUrl];
}


// Take the MP3 url and add it to our map
function registerTrack(url) {
	const results = parseMp3Url(url)
	if (null == results[2])
		return;
	updateMap(results[0], results[1], results[2]);
}


// When we get an M3U playlist, we want to pull the URL
// of the very last track segment in the M3U and add it as a value to our associative map
function registerPlaylist(responseDetails) {
	const gettingPlaylist = new Promise((resolve, reject) => {
		parsePlaylistContent(responseDetails.url, resolve);	
	});
	gettingPlaylist.then((body) => {
		registerTrack(body);
	});
}


// Find the Client ID we can use for API calls from 
// outbound requests we intercept
function getClientID(responseDetails) {
	clientID = responseDetails.url.split("client_id=")[1].split('&')[0];
	console.log("Client ID is ", clientID);
}


// Tries to launch the tab that will allow the user to download the track
// This is done by performing a lookup to try to get the URL of the track
// This may fail silently if we haven't sniffed the Client ID or parsed the M3U file yet.
function launchTrackTab(e) {
	console.log(e.url);
	const testURL = e.url.search(/https:\/\/soundcloud\.com/);
	if (-1 == testURL)
		return;

	if (null == clientID)
		return;

	const gettingTrackId = new Promise((resolve, reject) => {
		resolveTrackId(e.url, resolve);	
	});
	gettingTrackId.then((trackId) => {
		console.log("track Id: ", trackId);
		const gettingStreamInfo = new Promise((resolve, reject) => {
			resolveStreamInfo(trackId, resolve);
		});
		gettingStreamInfo.then((mp3Track) => {
			console.log("Track is!!! ", mp3Track);
			if (soundMap.has(mp3Track))
				console.log(browser.tabs.create({"active": true, "url": soundMap.get(mp3Track).url}))
		});
	});
}

browser.browserAction.onClicked.addListener(launchTrackTab);

browser.webRequest.onCompleted.addListener(
	registerPlaylist,
	{urls: [playlistFormat]}
);

browser.webRequest.onCompleted.addListener(
	getClientID,
	{urls: ["https://api.soundcloud.com/i1/tracks/*"]}
);

