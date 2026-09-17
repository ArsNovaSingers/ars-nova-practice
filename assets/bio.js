/**
 * Featured clips on a singer's Hub bio page (0.6.0).
 *
 * The clip's address is never in the page: pressing Play asks the site for a
 * fresh short-lived link, exactly like the takes box does. Only signed-in choir
 * members see this script at all.
 */
( function () {
	'use strict';

	var C = window.ANPRBIO || {};
	var T = C.i18n || {};
	var audio = new Audio();
	var current = null;

	function label( btn, playing ) {
		btn.textContent = playing ? ( T.pause || 'Pause' ) : ( T.play || 'Play' );
	}

	audio.addEventListener( 'ended', function () {
		if ( current ) {
			label( current, false );
		}
	} );

	document.addEventListener( 'click', function ( e ) {
		var btn = e.target.closest && e.target.closest( '[data-anpr-featured-take]' );
		if ( ! btn ) {
			return;
		}
		if ( current === btn && ! audio.paused ) {
			audio.pause();
			label( btn, false );
			return;
		}
		if ( current && current !== btn ) {
			label( current, false );
		}
		current = btn;
		btn.disabled = true;
		fetch( C.rest, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': C.nonce },
			body: JSON.stringify( { take: btn.getAttribute( 'data-anpr-featured-take' ) } ),
		} ).then( function ( r ) {
			return r.json();
		} ).then( function ( j ) {
			if ( ! j || ! j.url ) {
				throw new Error( ( j && j.message ) || 'no url' );
			}
			audio.src = j.url;
			return audio.play();
		} ).then( function () {
			label( btn, true );
		} ).catch( function () {
			btn.insertAdjacentText( 'afterend', ' ' + ( T.failed || 'That clip could not be played.' ) );
		} ).finally( function () {
			btn.disabled = false;
		} );
	} );
}() );
