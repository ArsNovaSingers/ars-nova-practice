/**
 * Ars Nova Practice — weekly builder (wp-admin).
 *
 * Holds the concert's weeks in memory, draws them, and on submit writes the
 * whole list as JSON into #anpr-weeks-json. The server cleans every field
 * again (ANPR_Weeks::sanitize_weeks), so this file is about being pleasant to
 * use, not about being the last line of defence.
 *
 * Typing never redraws (so focus is never lost). Adding, removing and moving
 * things redraws the whole builder, which is small.
 */
( function () {
	'use strict';

	var root = document.getElementById( 'anpr-builder' );
	var form = document.getElementById( 'anpr-builder-form' );
	if ( ! root || ! form ) {
		return;
	}
	var cfg = {};
	try {
		cfg = JSON.parse( root.getAttribute( 'data-config' ) || '{}' );
	} catch ( e ) {
		root.textContent = 'The builder data could not be read.';
		return;
	}
	var weeks = Array.isArray( cfg.weeks ) ? cfg.weeks : [];
	var materials = Array.isArray( cfg.materials ) ? cfg.materials : [];
	var parts = Array.isArray( cfg.parts ) ? cfg.parts : [];
	var byId = {};
	materials.forEach( function ( m ) { byId[ m.id ] = m; } );
	var dirty = false;
	var dirtyNote = document.querySelector( '.anpr-dirty' );

	function markDirty() {
		dirty = true;
		if ( dirtyNote ) {
			dirtyNote.hidden = false;
		}
	}

	function rid( prefix ) {
		var s = '';
		var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
		var buf = new Uint8Array( 10 );
		( window.crypto || window.msCrypto ).getRandomValues( buf );
		for ( var i = 0; i < buf.length; i++ ) {
			s += chars[ buf[ i ] % chars.length ];
		}
		return prefix + s;
	}

	function el( tag, attrs, kids ) {
		var n = document.createElement( tag );
		Object.keys( attrs || {} ).forEach( function ( k ) {
			var v = attrs[ k ];
			if ( v === null || v === undefined || v === false ) {
				return;
			}
			if ( k === 'text' ) {
				n.textContent = v;
			} else if ( k === 'class' ) {
				n.className = v;
			} else if ( k.indexOf( 'on' ) === 0 ) {
				n.addEventListener( k.slice( 2 ), v );
			} else if ( k === 'value' ) {
				n.value = v;
			} else if ( k === 'checked' ) {
				n.checked = !! v;
			} else {
				n.setAttribute( k, v === true ? '' : v );
			}
		} );
		( kids || [] ).forEach( function ( c ) {
			if ( c !== null && c !== undefined && c !== false ) {
				n.append( c );
			}
		} );
		return n;
	}

	function field( label, input, hint ) {
		var id = 'anpr-f-' + rid( '' );
		input.id = id;
		return el( 'div', { class: 'anpr-field' }, [
			el( 'label', { for: id, text: label } ),
			input,
			hint ? el( 'p', { class: 'description', text: hint } ) : null,
		] );
	}

	function bind( obj, key, input, cast ) {
		input.addEventListener( 'input', function () {
			obj[ key ] = cast ? cast( input.value ) : input.value;
			markDirty();
		} );
		input.addEventListener( 'change', function () {
			obj[ key ] = cast ? cast( input.value ) : input.value;
			markDirty();
		} );
		return input;
	}

	function move( list, i, delta ) {
		var j = i + delta;
		if ( j < 0 || j >= list.length ) {
			return;
		}
		var t = list[ i ];
		list[ i ] = list[ j ];
		list[ j ] = t;
		markDirty();
		render();
	}

	function addDays( ymd, n ) {
		if ( ! ymd ) {
			return '';
		}
		var d = new Date( ymd + 'T12:00:00Z' );
		d.setUTCDate( d.getUTCDate() + n );
		return d.toISOString().slice( 0, 10 );
	}

	function newWeek() {
		return { id: rid( 'w' ), title: '', due_date: '', due_label: '', show_from: '', note: '', video: '', status: 'draft', tasks: [ newTask() ] };
	}

	function newTask() {
		return { id: rid( 't' ), title: '', detail: '', video: '', minutes: 10, parts: [], materials: [] };
	}

	function copyWeek( src ) {
		var w = JSON.parse( JSON.stringify( src ) );
		w.id = rid( 'w' );
		w.status = 'draft';
		w.title = src.title ? src.title + ' (copy)' : '';
		w.due_date = addDays( src.due_date, 7 );
		w.show_from = addDays( src.show_from, 7 );
		w.tasks.forEach( function ( t ) { t.id = rid( 't' ); } );
		return w;
	}

	// ---------- drawing ----------
	function materialRow( task, m, idx ) {
		var info = byId[ m.id ];
		var name = info ? info.title : 'Missing: ' + m.id;
		var roleSel = el( 'select', { 'aria-label': 'How it is used' }, [
			el( 'option', { value: 'open', text: 'Open (score / link)' } ),
			info && info.playable ? el( 'option', { value: 'track', text: 'Practice track (plays in the player)' } ) : null,
		] );
		roleSel.value = m.role === 'track' && info && info.playable ? 'track' : 'open';
		if ( info && info.playable && m.role !== 'track' && trackCount( task ) > 0 ) {
			// Only one track per task: keep the extra one as an "open" link.
			roleSel.disabled = true;
			roleSel.title = 'This task already has a practice track. Give this one its own task.';
		}
		roleSel.addEventListener( 'change', function () {
			m.role = roleSel.value;
			markDirty();
			render();
		} );

		var trackBits = null;
		if ( m.role === 'track' ) {
			var partSel = el( 'select', { 'aria-label': 'Voice part of this track' }, [ el( 'option', { value: '', text: 'For everyone' } ) ].concat(
				parts.map( function ( p ) { return el( 'option', { value: p, text: 'Only ' + p + ' singers' } ); } )
			) );
			partSel.value = m.part || '';
			bind( m, 'part', partSel );
			var panSel = el( 'select', { 'aria-label': 'Starts in which ear' }, [
				el( 'option', { value: 'center', text: 'Both ears' } ),
				el( 'option', { value: 'left', text: 'Left ear' } ),
				el( 'option', { value: 'right', text: 'Right ear' } ),
			] );
			panSel.value = m.pan || 'center';
			bind( m, 'pan', panSel );
			var mute = el( 'input', { type: 'checkbox', checked: !! m.muted } );
			mute.addEventListener( 'change', function () { m.muted = mute.checked; markDirty(); } );
			trackBits = el( 'span', { class: 'anpr-trackbits' }, [
				partSel, panSel, el( 'label', {}, [ mute, ' starts muted' ] ),
			] );
		}

		return el( 'li', { class: 'anpr-mat' + ( info ? '' : ' is-missing' ) }, [
			el( 'span', { class: 'anpr-mat-name' }, [
				el( 'strong', { text: name } ),
				info && info.piece ? el( 'small', { text: ' — ' + info.piece + ( info.section ? ' / ' + info.section : '' ) } ) : null,
				info ? null : el( 'small', { text: ' (no longer in this concert\'s materials; singers will not see it)' } ),
			] ),
			roleSel,
			trackBits,
			el( 'button', { type: 'button', class: 'button', text: '↑', title: 'Move up', 'aria-label': 'Move up (tracks play in this order: the first is Track 1)', onclick: function () { move( task.materials, idx, -1 ); } } ),
			el( 'button', { type: 'button', class: 'button', text: '↓', title: 'Move down', 'aria-label': 'Move down', onclick: function () { move( task.materials, idx, 1 ); } } ),
			el( 'button', { type: 'button', class: 'button-link anpr-remove', text: 'Remove', onclick: function () {
				task.materials.splice( idx, 1 );
				markDirty();
				render();
			} } ),
		] );
	}

	/** A task is one practice track (Jonathan, 2026-09-17): its own accordion,
	 *  its own Done and its own rating on the singer's page. */
	function trackCount( task ) {
		return task.materials.filter( function ( m ) { return m.role === 'track'; } ).length;
	}

	function attachControl( task ) {
		var hasTrack = trackCount( task ) > 0;
		var sel = el( 'select', { 'aria-label': 'Attach a material' }, [ el( 'option', { value: '', text: 'Attach a score, link or recording…' } ) ] );
		var groups = {};
		materials.forEach( function ( m ) {
			var used = task.materials.some( function ( x ) { return x.id === m.id; } );
			if ( used ) {
				return;
			}
			if ( hasTrack && m.playable ) {
				return; // one practice track per task
			}
			var key = m.piece || 'Other materials';
			if ( ! groups[ key ] ) {
				groups[ key ] = el( 'optgroup', { label: key } );
				sel.append( groups[ key ] );
			}
			groups[ key ].append( el( 'option', { value: m.id, text: ( m.playable ? '♪ ' : '' ) + m.title + ( m.section ? ' (' + m.section + ')' : '' ) } ) );
		} );
		var add = el( 'button', { type: 'button', class: 'button', text: 'Attach', onclick: function () {
			var m = byId[ sel.value ];
			if ( ! m ) {
				return;
			}
			task.materials.push( { id: m.id, role: ( m.playable && ! hasTrack ) ? 'track' : 'open', part: '', pan: 'center', muted: false, title: m.title, piece: m.piece, type: m.type } );
			markDirty();
			render();
		} } );
		return el( 'div', { class: 'anpr-attach' }, [
			sel,
			add,
			el( 'span', { class: 'description', text: hasTrack
				? ' This task already has its practice track. Add a score or link here; for another track, make another task.'
				: ' ♪ = plays in the practice player. One practice track per task: the task opens straight into the recorder for that track.' } ),
		] );
	}

	function taskCard( week, task, ti ) {
		var title = bind( task, 'title', el( 'input', { type: 'text', class: 'regular-text', value: task.title || '', placeholder: 'e.g. Rivers mvt 1, bars 1–40: learn the notes' } ) );
		var minutes = bind( task, 'minutes', el( 'input', { type: 'number', min: 0, max: 600, step: 5, class: 'small-text', value: task.minutes || 0 } ), function ( v ) { return parseInt( v, 10 ) || 0; } );
		var detail = bind( task, 'detail', el( 'textarea', { rows: 2, class: 'large-text', value: task.detail || '', placeholder: 'What to do, pages or bars, what to listen for' } ) );

		var partBoxes = el( 'span', { class: 'anpr-parts' }, parts.map( function ( p ) {
			var cb = el( 'input', { type: 'checkbox', checked: ( task.parts || [] ).indexOf( p ) !== -1 } );
			cb.addEventListener( 'change', function () {
				task.parts = ( task.parts || [] ).filter( function ( x ) { return x !== p; } );
				if ( cb.checked ) {
					task.parts.push( p );
				}
				markDirty();
			} );
			return el( 'label', {}, [ cb, ' ' + p ] );
		} ) );

		return el( 'li', { class: 'anpr-task-edit' }, [
			el( 'div', { class: 'anpr-row' }, [
				el( 'span', { class: 'anpr-num', text: ( ti + 1 ) + '.' } ),
				field( 'Task', title ),
				field( 'Minutes', minutes ),
				el( 'span', { class: 'anpr-rowtools' }, [
					el( 'button', { type: 'button', class: 'button', text: '↑', title: 'Move up', 'aria-label': 'Move task up', onclick: function () { move( week.tasks, ti, -1 ); } } ),
					el( 'button', { type: 'button', class: 'button', text: '↓', title: 'Move down', 'aria-label': 'Move task down', onclick: function () { move( week.tasks, ti, 1 ); } } ),
					el( 'button', { type: 'button', class: 'button-link anpr-remove', text: 'Delete task', onclick: function () {
						if ( window.confirm( 'Delete this task? Singers\' ticks for it will no longer show.' ) ) {
							week.tasks.splice( ti, 1 );
							markDirty();
							render();
						}
					} } ),
				] ),
			] ),
			field( 'Details', detail ),
			field( 'Video link (optional)', bind( task, 'video', el( 'input', { type: 'url', class: 'regular-text', value: task.video || '', placeholder: 'https://www.youtube.com/watch?v=… (shown inside this task)' } ) ) ),
			el( 'div', { class: 'anpr-field' }, [
				el( 'span', { class: 'anpr-label', text: 'Who is this for? (none ticked = everyone)' } ),
				partBoxes,
			] ),
			el( 'div', { class: 'anpr-field' }, [
				el( 'span', { class: 'anpr-label', text: 'Music and links' } ),
				el( 'ul', { class: 'anpr-mats' }, task.materials.map( function ( m, mi ) { return materialRow( task, m, mi ); } ) ),
				attachControl( task ),
			] ),
		] );
	}

	function weekCard( week, wi ) {
		var status = el( 'select', {}, [
			el( 'option', { value: 'draft', text: 'Draft (staff only)' } ),
			el( 'option', { value: 'published', text: 'Published' } ),
		] );
		status.value = week.status === 'published' ? 'published' : 'draft';
		status.addEventListener( 'change', function () {
			week.status = status.value;
			markDirty();
			render();
		} );

		var summaryText = ( week.title || 'Untitled week' ) + ( week.due_date ? ' — due ' + week.due_date : '' ) + ' — ' + week.tasks.length + ' task' + ( week.tasks.length === 1 ? '' : 's' );
		var det = el( 'details', { class: 'anpr-week-edit' + ( week.status === 'published' ? ' is-published' : '' ), open: week._open !== false } );
		det.addEventListener( 'toggle', function () { week._open = det.open; } );
		det.append(
			el( 'summary', {}, [
				el( 'span', { class: 'anpr-badge', text: week.status === 'published' ? 'Published' : 'Draft' } ),
				' ' + summaryText,
			] ),
			el( 'div', { class: 'anpr-grid' }, [
				field( 'Week title', bind( week, 'title', el( 'input', { type: 'text', class: 'regular-text', value: week.title || '', placeholder: 'e.g. Week 3 — Rivers, first half' } ) ) ),
				field( 'Status', status ),
				field( 'Have ready by', bind( week, 'due_date', el( 'input', { type: 'date', value: week.due_date || '' } ) ), 'Usually the rehearsal date.' ),
				field( 'Rehearsal label', bind( week, 'due_label', el( 'input', { type: 'text', value: week.due_label || '', placeholder: 'e.g. Thursday rehearsal, 7 pm' } ) ) ),
				field( 'Show to singers from', bind( week, 'show_from', el( 'input', { type: 'date', value: week.show_from || '' } ) ), 'Leave empty to show as soon as it is published.' ),
			] ),
			field( 'Note from the director (optional)', bind( week, 'note', el( 'textarea', { rows: 3, class: 'large-text', value: week.note || '' } ) ) ),
			field( 'Video for this week (optional)', bind( week, 'video', el( 'input', { type: 'url', class: 'regular-text', value: week.video || '', placeholder: 'https://www.youtube.com/watch?v=… (shown at the top of the week)' } ) ) ),
			el( 'ol', { class: 'anpr-task-list' }, week.tasks.map( function ( t, ti ) { return taskCard( week, t, ti ); } ) ),
			el( 'p', {}, [
				el( 'button', { type: 'button', class: 'button', text: '+ Add a task', onclick: function () {
					week.tasks.push( newTask() );
					markDirty();
					render();
				} } ),
			] ),
			el( 'p', { class: 'anpr-weektools' }, [
				el( 'button', { type: 'button', class: 'button', text: 'Move week up', onclick: function () { move( weeks, wi, -1 ); } } ),
				el( 'button', { type: 'button', class: 'button', text: 'Move week down', onclick: function () { move( weeks, wi, 1 ); } } ),
				el( 'button', { type: 'button', class: 'button', text: 'Copy this week', onclick: function () {
					weeks.splice( wi + 1, 0, copyWeek( week ) );
					markDirty();
					render();
				} } ),
				el( 'button', { type: 'button', class: 'button-link anpr-remove', text: 'Delete week', onclick: function () {
					if ( window.confirm( 'Delete this whole week? Singers\' ticks for it will no longer show.' ) ) {
						weeks.splice( wi, 1 );
						markDirty();
						render();
					}
				} } ),
			] )
		);
		return det;
	}

	function render() {
		var top = el( 'p', { class: 'anpr-toolbar' }, [
			el( 'button', { type: 'button', class: 'button button-secondary', text: '+ Add a week', onclick: function () {
				weeks.push( newWeek() );
				markDirty();
				render();
			} } ),
			weeks.length ? el( 'button', { type: 'button', class: 'button', text: 'Copy the last week', onclick: function () {
				weeks.push( copyWeek( weeks[ weeks.length - 1 ] ) );
				markDirty();
				render();
			} } ) : null,
			materials.length ? null : el( 'span', { class: 'description', text: ' This concert has no materials yet, so there is nothing to attach. Add them on the concert screen (or press Rescan Drive there).' } ),
		] );
		var list = weeks.length
			? el( 'div', { class: 'anpr-weeks' }, weeks.map( weekCard ) )
			: el( 'p', { class: 'anpr-emptystate', text: 'No weeks yet. Press "+ Add a week" to start.' } );
		root.replaceChildren( top, list );
	}

	form.addEventListener( 'submit', function () {
		var clean = weeks.map( function ( w ) {
			var c = JSON.parse( JSON.stringify( w ) );
			delete c._open;
			// Keep a snapshot of each attached item so the server can find it
			// again if the Hub lists it under a different id later.
			c.tasks.forEach( function ( t ) {
				t.materials.forEach( function ( m ) {
					var info = byId[ m.id ];
					if ( info ) {
						m.title = info.title;
						m.piece = info.piece;
						m.type = info.type;
					}
				} );
			} );
			return c;
		} );
		document.getElementById( 'anpr-weeks-json' ).value = JSON.stringify( clean );
		dirty = false;
	} );
	window.addEventListener( 'beforeunload', function ( e ) {
		if ( dirty ) {
			e.preventDefault();
			e.returnValue = '';
		}
	} );

	render();
}() );
