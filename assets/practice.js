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

	/** The week's summary bar: tasks done, time rehearsed, how it is going. */
	function updateRing( week ) {
		var box = week && week.querySelector( '[data-anpr-summary]' );
		if ( ! box ) {
			return;
		}
		var tasks = week.querySelectorAll( '[data-anpr-task]' );
		var done = week.querySelectorAll( '[data-anpr-rate][data-rated="1"]' ).length;
		var total = tasks.length;
		var el = function ( sel ) { return box.querySelector( sel ); };
		if ( el( '[data-anpr-donecount]' ) ) {
			el( '[data-anpr-donecount]' ).textContent = done + ' / ' + total;
		}
		if ( el( '[data-anpr-donesr]' ) ) {
			el( '[data-anpr-donesr]' ).textContent = fmt( T.ratedOf || '%1$d of %2$d tasks rated', done, total );
		}
		var sum = 0;
		var n = 0;
		tasks.forEach( function ( task ) {
			var input = task.querySelector( '[data-anpr-rate]' );
			if ( input && input.getAttribute( 'data-rated' ) === '1' ) {
				sum += Number( input.value );
				n++;
			}
		} );
		var mean = n ? Math.round( sum / n ) : null;
		if ( el( '[data-anpr-bar]' ) ) {
			el( '[data-anpr-bar]' ).style.width = Math.min( 100, mean || 0 ) + '%';
		}
		var avg = el( '[data-anpr-avg]' );
		if ( avg ) {
			avg.textContent = null === mean ? '—' : mean + '%';
		}
		var stat = box.querySelector( '.anpr-stat--going' );
		if ( stat ) {
			stat.style.setProperty( '--anpr-conf', String( mean || 0 ) );
		}
		var note = el( '[data-anpr-avgnote]' );
		if ( note ) {
			note.textContent = null === mean ? ( T.saySomething || 'move a slider to say how it is going' ) : saying( mean );
		}
	}

	/** Add rehearsal seconds to the week's "Time rehearsed", as they happen. */
	function addSeconds( task, secs ) {
		var week = task && task.closest( '.anpr-week' );
		var box = week && week.querySelector( '[data-anpr-summary]' );
		if ( ! box || ! secs ) {
			return;
		}
		var total = Math.max( 0, Number( box.getAttribute( 'data-anpr-secs' ) || 0 ) + secs );
		box.setAttribute( 'data-anpr-secs', String( Math.round( total ) ) );
		var out = box.querySelector( '[data-anpr-time]' );
		if ( out ) {
			out.textContent = total < 60
				? fmt( T.secLabel || '%d sec', Math.round( total ) )
				: fmt( T.minLabel || '%d min', Math.round( total / 60 ) );
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

	// ---------- how it is going (0-111%) ----------
	var rateTimers = new WeakMap();

	/** The sentence for a percentage, from the ladder the server passed down. */
	function saying( value ) {
		var steps = C.confidence || [];
		var text = '';
		steps.forEach( function ( step ) {
			if ( value >= step[ 0 ] ) {
				text = step[ 1 ];
			}
		} );
		return text;
	}

	function showRating( input ) {
		var wrap = input.closest( '.anpr-conf' );
		var value = Number( input.value );
		var text = saying( value );
		if ( wrap ) {
			wrap.classList.remove( 'is-unset' );
			wrap.style.setProperty( '--anpr-conf', String( value ) );
			var say = wrap.querySelector( '[data-anpr-say]' );
			if ( say ) {
				say.textContent = text;
			}
			var num = wrap.querySelector( '[data-anpr-num]' );
			if ( num ) {
				num.textContent = value + '%';
			}
		}
		var task = input.closest( '[data-anpr-task]' );
		if ( task ) {
			task.classList.toggle( 'is-proud', value >= 100 );
		}
		input.setAttribute( 'aria-valuetext', text + ' — ' + value + '%' );
		input.setAttribute( 'data-rated', '1' );
	}

	/** The "featured on your bio" line under the player, after the server answers. */
	function showShared( task, on, message ) {
		if ( ! task ) {
			return;
		}
		var note = task.querySelector( '[data-anpr-shared]' );
		if ( ! note ) {
			if ( ! on && ! message ) {
				return;
			}
			note = document.createElement( 'p' );
			note.className = 'anpr-shared';
			note.setAttribute( 'data-anpr-shared', '' );
			var body = task.querySelector( '.anpr-task-body' );
			var err = task.querySelector( '.anpr-task-error' );
			if ( body ) {
				body.insertBefore( note, err || null );
			}
		}
		note.textContent = message || ( T.featured || 'Your newest take for this piece is featured on your bio for the choir to hear.' );
		note.hidden = ! on && ! message;
		note.classList.toggle( 'is-warning', !! message && ! on );
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
		updateRing( input.closest( '.anpr-week' ) );
		clearTimeout( rateTimers.get( input ) );
		rateTimers.set( input, setTimeout( function () {
			var task = input.closest( '[data-anpr-task]' );
			var d = ids( input );
			d.event = 'rate';
			d.value = Number( input.value );
			send( d ).then( function ( r ) {
				showError( task, false );
				if ( r && r.featured ) {
					showShared( task, true, '' );
				} else if ( r && r.featured_failed ) {
					showShared( task, false, T.featuredNoTake || 'Save a take for this piece first, then it can be featured on your bio.' );
				} else {
					showShared( task, false, '' );
				}
			} ).catch( function () { showError( task, true ); } );
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
	var open = null; // { task, host, ctrl, listened, counted, pending }

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
		s.host.replaceChildren();
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

	function openPlayer( host ) {
		var wrap = host.closest( '.anpr-practice' );
		var task = host.closest( '[data-anpr-task]' );
		var item = host;
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
		var state = { task: task, host: host, material: track.id || '', ctrl: null, listened: 0, counted: false, pending: 0 };
		open = state;
		host.hidden = false;
		host.textContent = ( T.player && T.player.loading ) || '…';

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
					addSeconds( task, secs );
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
				onRecorded: function ( secs ) {
					// Recording counts as rehearsal time too (Jonathan, 2026-09-17).
					secs = Math.max( 0, Math.round( secs ) );
					if ( ! secs ) {
						return;
					}
					addSeconds( task, secs );
					var d = ids( task );
					d.event = 'record';
					d.seconds = secs;
					d.material_id = state.material;
					send( d ).catch( function () {} );
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

	// ---------- task accordions ----------
	// The recorder IS the task (0.5.0): opening a task mounts its player and
	// closing it takes the player down, so only one set of audio is ever loaded.
	function setTask( task, wanted ) {
		var btn = task.querySelector( '[data-anpr-task-toggle]' );
		var body = task.querySelector( '.anpr-task-body' );
		if ( ! btn || ! body ) {
			return;
		}
		btn.setAttribute( 'aria-expanded', wanted ? 'true' : 'false' );
		body.hidden = ! wanted;
		task.classList.toggle( 'is-open', !! wanted );
		var host = body.querySelector( '.anpr-player-host' );
		if ( ! host ) {
			return;
		}
		if ( wanted ) {
			if ( ! open || open.host !== host ) {
				openPlayer( host );
			}
		} else if ( open && open.host === host ) {
			closePlayer( false );
		}
	}

	document.addEventListener( 'click', function ( e ) {
		var btn = e.target.closest && e.target.closest( '[data-anpr-task-toggle]' );
		if ( ! btn ) {
			return;
		}
		var task = btn.closest( '[data-anpr-task]' );
		var isOpen = btn.getAttribute( 'aria-expanded' ) === 'true';
		if ( ! isOpen ) {
			// One task at a time keeps the page short and the audio predictable.
			task.closest( '.anpr-week' ).querySelectorAll( '[data-anpr-task].is-open' ).forEach( function ( other ) {
				if ( other !== task ) {
					setTask( other, false );
				}
			} );
		}
		setTask( task, ! isOpen );
		setTimeout( checkViews, 50 );
	} );

	function openTasksOnLoad() {
		document.querySelectorAll( '[data-anpr-task]' ).forEach( function ( task ) {
			var btn = task.querySelector( '[data-anpr-task-toggle]' );
			if ( btn && btn.getAttribute( 'aria-expanded' ) === 'true' ) {
				setTask( task, true );
			}
		} );
	}

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
	function start() {
		openTasksOnLoad();
		checkViews();
	}
	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', start );
	} else {
		start();
	}
}() );
