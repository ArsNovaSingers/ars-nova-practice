/**
 * Ars Nova Practice — singer page behaviour.
 *
 * Done ticks, the Bad/Fair/Good/Great slider, score-open counting, and the
 * practice player (loaded only when a singer opens it, so a page with ten
 * tasks does not download ten sets of audio).
 *
 * Every write is a POST to ars-nova-practice/v1/event. Nothing is read back
 * over REST; the page is drawn by the server.
 */
( function () {
	'use strict';

	var C = window.ANPR || {};
	var T = C.i18n || {};
	var TK = C.takes || {};
	var PLAY_AFTER = Number( C.playAfter || 20 );

	function send( data, useBeacon ) {
		if ( ! C.rest ) {
			return Promise.reject( new Error( 'not configured' ) );
		}
		if ( useBeacon && navigator.sendBeacon ) {
			var fd = new FormData();
			Object.keys( data ).forEach( function ( k ) { fd.append( k, data[ k ] ); } );
			fd.append( '_wpnonce', C.nonce );
			navigator.sendBeacon( C.rest, fd );
			return Promise.resolve( { ok: true } );
		}
		return fetch( C.rest, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': C.nonce },
			body: JSON.stringify( data ),
			keepalive: true,
		} ).then( function ( r ) {
			if ( ! r.ok ) {
				throw new Error( 'HTTP ' + r.status );
			}
			return r.json();
		} );
	}

	function ids( node ) {
		var task = node.closest( '[data-anpr-task]' );
		var week = node.closest( '[data-anpr-week]' );
		return {
			project_id: ( task || week ).getAttribute( 'data-anpr-project' ),
			week_id: ( task || week ).getAttribute( 'data-anpr-week' ),
			task_id: task ? task.getAttribute( 'data-anpr-task' ) : '',
		};
	}

	function showError( task, on ) {
		var box = task && task.querySelector( '.anpr-task-error' );
		if ( ! box ) {
			return;
		}
		box.textContent = on ? ( T.saveFailed || 'Not saved.' ) : '';
		box.hidden = ! on;
	}

	function fmt( s, a, b ) {
		return String( s ).replace( '%1$d', a ).replace( '%2$d', b ).replace( '%d', a );
	}

	function updateRing( week ) {
		var ring = week && week.querySelector( '[data-anpr-ring]' );
		if ( ! ring ) {
			return;
		}
		var tasks = week.querySelectorAll( '[data-anpr-task]' );
		var done = week.querySelectorAll( '[data-anpr-task].is-done' ).length;
		var total = tasks.length;
		ring.style.setProperty( '--anpr-pct', total ? Math.round( ( 100 * done ) / total ) : 0 );
		var text = ring.querySelector( '.anpr-ring-text' );
		if ( text ) {
			text.textContent = done + '/' + total;
		}
		var sr = ring.querySelector( '.anpr-sr' );
		if ( sr ) {
			sr.textContent = fmt( T.doneOf || '%1$d of %2$d done', done, total );
		}
	}

	// ---------- week views ----------
	var viewed = {};
	function markViewed( week ) {
		if ( ! week ) {
			return;
		}
		var key = week.getAttribute( 'data-anpr-project' ) + ':' + week.getAttribute( 'data-anpr-week' );
		if ( viewed[ key ] ) {
			return;
		}
		// Only count a view when the week is actually on screen: the ensemble
		// tab and this sub-tab may both be hidden when the page loads.
		if ( ! week.offsetParent ) {
			return;
		}
		viewed[ key ] = true;
		var d = ids( week );
		d.event = 'view';
		send( d ).catch( function () { viewed[ key ] = false; } );
	}
	function checkViews() {
		document.querySelectorAll( '.anpr-week' ).forEach( function ( w ) {
			var inClosed = w.closest( 'details:not([open])' );
			if ( ! inClosed ) {
				markViewed( w );
			}
		} );
	}

	// ---------- done ----------
	document.addEventListener( 'change', function ( e ) {
		var box = e.target.closest && e.target.closest( '[data-anpr-done]' );
		if ( ! box ) {
			return;
		}
		var task = box.closest( '[data-anpr-task]' );
		var d = ids( box );
		d.event = box.checked ? 'done' : 'undone';
		task.classList.toggle( 'is-done', box.checked );
		updateRing( task.closest( '.anpr-week' ) );
		send( d ).then( function () { showError( task, false ); } ).catch( function () {
			box.checked = ! box.checked;
			task.classList.toggle( 'is-done', box.checked );
			updateRing( task.closest( '.anpr-week' ) );
			showError( task, true );
		} );
	} );

	// ---------- rating ----------
	var rateTimers = new WeakMap();
	function showRating( input ) {
		var wrap = input.closest( '.anpr-rating' );
		var out = wrap && wrap.querySelector( '.anpr-rating-out' );
		var label = ( C.ratings || [] )[ Number( input.value ) ] || '';
		if ( out ) {
			out.textContent = label;
		}
		input.setAttribute( 'aria-valuetext', label );
		if ( wrap ) {
			wrap.classList.remove( 'is-unrated' );
		}
		input.setAttribute( 'data-rated', '1' );
	}
	document.addEventListener( 'input', function ( e ) {
		var input = e.target.closest && e.target.closest( '[data-anpr-rate]' );
		if ( input ) {
			showRating( input );
		}
	} );
	document.addEventListener( 'change', function ( e ) {
		var input = e.target.closest && e.target.closest( '[data-anpr-rate]' );
		if ( ! input ) {
			return;
		}
		showRating( input );
		clearTimeout( rateTimers.get( input ) );
		rateTimers.set( input, setTimeout( function () {
			var task = input.closest( '[data-anpr-task]' );
			var d = ids( input );
			d.event = 'rate';
			d.value = Number( input.value );
			send( d ).then( function () { showError( task, false ); } ).catch( function () { showError( task, true ); } );
		}, 400 ) );
	} );
	// A tap on an unrated slider at its resting value fires no change event.
	document.addEventListener( 'pointerup', function ( e ) {
		var input = e.target.closest && e.target.closest( '[data-anpr-rate]' );
		if ( input && input.getAttribute( 'data-rated' ) === '0' ) {
			input.dispatchEvent( new Event( 'change', { bubbles: true } ) );
		}
	} );

	// ---------- score / link opens ----------
	document.addEventListener( 'click', function ( e ) {
		var a = e.target.closest && e.target.closest( '[data-anpr-open]' );
		if ( ! a ) {
			return;
		}
		var d = ids( a );
		d.event = 'open';
		d.material_id = a.getAttribute( 'data-anpr-open' );
		send( d, true );
	} );

	// ---------- practice player ----------
	var modPromise = null;
	var open = null; // { task, host, button, ctrl, listened, counted, pending }

	function loadPlayer() {
		if ( ! modPromise ) {
			modPromise = import( C.playerUrl );
		}
		return modPromise;
	}

	function setPlays( task, n ) {
		var el = task.querySelector( '[data-anpr-plays]' );
		if ( ! el ) {
			return;
		}
		el.setAttribute( 'data-anpr-plays', String( n ) );
		el.textContent = n ? fmt( T.played || 'Played %d×', n ) : ( T.notPlayed || '' );
	}

	function flush( state, beacon ) {
		if ( ! state || state.pending < 1 ) {
			return;
		}
		var d = ids( state.task );
		d.event = 'listen';
		d.material_id = state.material || '';
		d.seconds = Math.round( state.pending );
		state.pending = 0;
		send( d, beacon ).catch( function () {} );
	}

	function closePlayer( beacon ) {
		if ( ! open ) {
			return;
		}
		var s = open;
		open = null;
		try {
			if ( s.ctrl ) {
				s.ctrl.destroy();
			}
		} catch ( err ) { /* ignore */ }
		flush( s, beacon );
		s.host.hidden = true;
		s.host.replaceChildren();
		s.button.setAttribute( 'aria-expanded', 'false' );
		s.button.classList.remove( 'is-open' );
	}

	// ---------- saved takes (0.4.0) ----------
	function takeCall( action, data ) {
		return fetch( TK.rest + action, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': C.nonce },
			body: JSON.stringify( data ),
		} ).then( function ( r ) {
			return r.json().catch( function () { return {}; } ).then( function ( j ) {
				if ( ! r.ok || ! j || ( j.code && ! j.ok ) ) {
					throw new Error( ( j && j.message ) || ( 'HTTP ' + r.status ) );
				}
				return j;
			} );
		} );
	}

	/** The saved takes of a practice block, parsed once and shared by its players. */
	function takesFor( wrap ) {
		if ( ! wrap._anprTakes ) {
			var node = wrap.querySelector( '[data-anpr-takes]' );
			var parsed = {};
			try {
				parsed = JSON.parse( ( node && node.textContent ) || '{}' ) || {};
			} catch ( err ) {
				parsed = {};
			}
			wrap._anprTakes = parsed;
		}
		return wrap._anprTakes;
	}

	function openPlayer( button ) {
		var wrap = button.closest( '.anpr-practice' );
		var task = button.closest( '[data-anpr-task]' );
		var item = button.closest( '[data-anpr-track-index]' );
		var host = item.querySelector( '.anpr-player-host' );
		var json = wrap.querySelector( '[data-anpr-tracks]' );
		var tracks = [];
		try {
			tracks = JSON.parse( json.textContent || '[]' );
		} catch ( err ) {
			tracks = [];
		}
		var track = tracks[ Number( item.getAttribute( 'data-anpr-track-index' ) ) ];
		if ( ! track ) {
			return;
		}
		closePlayer( false );
		var state = { task: task, host: host, button: button, material: track.id || '', ctrl: null, listened: 0, counted: false, pending: 0 };
		open = state;
		host.hidden = false;
		host.textContent = ( T.player && T.player.loading ) || '…';
		button.setAttribute( 'aria-expanded', 'true' );
		button.classList.add( 'is-open' );

		loadPlayer().then( function ( mod ) {
			if ( open !== state ) {
				return;
			}
			var pieces = takesFor( wrap );
			var piece = track.piece || ( 'm-' + track.id );
			if ( ! Array.isArray( pieces[ piece ] ) ) {
				pieces[ piece ] = [];
			}
			var base = ids( task );
			var takes = TK.rest ? {
				canSave: !! TK.save,
				limit: TK.limit,
				format: TK.format,
				pieceLabel: track.piece_label || track.title,
				list: pieces[ piece ],
				api: {
					start: function ( o ) {
						return takeCall( 'start', Object.assign( {}, base, { material_id: track.id }, o || {} ) );
					},
					finish: function ( id ) { return takeCall( 'finish', { take: id } ); },
					rename: function ( id, name ) { return takeCall( 'rename', { take: id, name: name } ); },
					url: function ( id, dl ) { return takeCall( 'url', { take: id, download: dl ? 1 : 0 } ); },
					remove: function ( id ) { return takeCall( 'delete', { take: id } ); },
				},
			} : null;
			state.ctrl = mod.mountPlayer( host, {
				tracks: [ track ],
				takes: takes,
				recording: !! C.recording,
				strings: T.player || {},
				onListen: function ( secs ) {
					state.listened += secs;
					state.pending += secs;
					if ( ! state.counted && state.listened >= PLAY_AFTER ) {
						state.counted = true;
						var d = ids( task );
						d.event = 'play';
						d.seconds = 0;
						d.material_id = state.material;
						send( d ).then( function ( r ) {
							if ( r && typeof r.plays === 'number' ) {
								setPlays( task, r.plays );
							}
						} ).catch( function () {} );
					}
					if ( state.pending >= 30 ) {
						flush( state, false );
					}
				},
				onError: function ( msg, detail ) {
					if ( window.console ) {
						window.console.warn( '[anpr]', msg, detail );
					}
				},
			} );
		} ).catch( function ( err ) {
			if ( window.console ) {
				window.console.error( '[anpr] player failed to load', err );
			}
			host.textContent = T.loadFailed || 'The player could not start.';
		} );
	}

	document.addEventListener( 'click', function ( e ) {
		var btn = e.target.closest && e.target.closest( '[data-anpr-player-toggle]' );
		if ( ! btn ) {
			return;
		}
		if ( btn.getAttribute( 'aria-expanded' ) === 'true' ) {
			closePlayer( false );
		} else {
			openPlayer( btn );
		}
	} );

	// A singer switching tabs or closing the page: record what was listened.
	window.addEventListener( 'pagehide', function () { closePlayer( true ); } );
	document.addEventListener( 'visibilitychange', function () {
		if ( document.visibilityState === 'hidden' && open ) {
			flush( open, true );
		}
	} );

	// Sub-tab switches and <details> toggles can reveal a week.
	document.addEventListener( 'click', function () { setTimeout( checkViews, 50 ); } );
	document.addEventListener( 'toggle', function () { setTimeout( checkViews, 50 ); }, true );
	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', checkViews );
	} else {
		checkViews();
	}
}() );
