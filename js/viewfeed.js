var article_cache = new Array();

var _active_article_id = 0;

var vgroup_last_feed = false;
var post_under_pointer = false;

var last_requested_article = false;

var catchup_id_batch = [];
var catchup_timeout_id = false;

var cids_requested = [];
var loaded_article_ids = [];

var has_storage = 'sessionStorage' in window && window['sessionStorage'] !== null;

function headlines_callback2(transport, offset, background, infscroll_req) {
	try {
		handle_rpc_json(transport);

		loading_set_progress(25);

		console.log("headlines_callback2 [offset=" + offset + "] B:" + background + " I:" + infscroll_req);

		var is_cat = false;
		var feed_id = false;

		var reply = false;

		try {
			reply = JSON.parse(transport.responseText);
		} catch (e) {
			console.error(e);
		}

		if (reply) {

			is_cat = reply['headlines']['is_cat'];
			feed_id = reply['headlines']['id'];

			if (background) {
				var content = reply['headlines']['content'];

				if (getInitParam("cdm_auto_catchup") == 1) {
					content = content + "<div id='headlines-spacer'></div>";
				}
				return;
			}

			setActiveFeedId(feed_id, is_cat);

			dijit.getEnclosingWidget(
				document.forms["main_toolbar_form"].update).attr('disabled',
					is_cat || feed_id <= 0);

			try {
				if (infscroll_req == false) {
					$("headlines-frame").scrollTop = 0;
				}
			} catch (e) { };

			var headlines_count = reply['headlines-info']['count'];

			vgroup_last_feed = reply['headlines-info']['vgroup_last_feed'];

			if (parseInt(headlines_count) < getInitParam("default_article_limit")) {
				_infscroll_disable = 1;
			} else {
				_infscroll_disable = 0;
			}

			var counters = reply['counters'];
			var articles = reply['articles'];
			//var runtime_info = reply['runtime-info'];

			if (infscroll_req == false) {
				loaded_article_ids = [];

				dijit.byId("headlines-frame").attr('content',
					reply['headlines']['content']);

				dijit.byId("headlines-toolbar").attr('content',
					reply['headlines']['toolbar']);

				$$("#headlines-frame > div[id*=RROW]").each(function(row) {
					if (loaded_article_ids.indexOf(row.id) != -1) {
						row.parentNode.removeChild(row);
					} else {
						loaded_article_ids.push(row.id);
					}
				});

				if (getInitParam("cdm_auto_catchup") == 1) {
					var hsp = $("headlines-spacer");
					if (!hsp) hsp = new Element("DIV", {"id": "headlines-spacer"});
					dijit.byId('headlines-frame').domNode.appendChild(hsp);
				}

				initHeadlinesMenu();

				if (_search_query) {
					$("feed_title").innerHTML += "<span id='cancel_search'>" +
						" (<a href='#' onclick='cancelSearch()'>" + __("Cancel search") + "</a>)" +
						"</span>";
				}

			} else {

				if (headlines_count > 0 && feed_id == getActiveFeedId() && is_cat == activeFeedIsCat()) {
					console.log("adding some more headlines: " + headlines_count);

					var c = dijit.byId("headlines-frame");
					var ids = getSelectedArticleIds2();
					var new_elems = [];

					$("headlines-tmp").innerHTML = reply['headlines']['content'];

					var hsp = $("headlines-spacer");

					if (hsp)
						c.domNode.removeChild(hsp);

					$$("#headlines-tmp > div").each(function(row) {
						if (row.className == 'cdmFeedTitle') {
							row.style.display = 'none';
							c.domNode.appendChild(row);
							new_elems.push(row);
						} else if (loaded_article_ids.indexOf(row.id) == -1) {
							row.style.display = 'none';
							c.domNode.appendChild(row);
							new_elems.push(row);
							loaded_article_ids.push(row.id);
						} else {
							row.parentNode.removeChild(row);
						}
					});

					if (!hsp) hsp = new Element("DIV", {"id": "headlines-spacer"});

					fixHeadlinesOrder(getLoadedArticleIds());

					if (getInitParam("cdm_auto_catchup") == 1) {
						c.domNode.appendChild(hsp);
					}

					console.log("added " + new_elems.size() + " headlines");

					if (new_elems.size() == 0)
						_infscroll_disable = true;

					console.log("restore selected ids: " + ids);

					for (var i = 0; i < ids.length; i++) {
						markHeadline(ids[i]);
					}

					initHeadlinesMenu();

					new_elems.each(function(child) {
						var cb = dijit.byId(child.id.replace("RROW-", "RCHK-"));

						if (!cb) {
							dojo.parser.parse(child);

							if (!Element.visible(child))
								new Effect.Appear(child, { duration : 0.5 });
						} else {
							c.domNode.removeChild(child);
						}
					});

				} else {
					console.log("no new headlines received");

					var hsp = $("headlines-spacer");

					if (hsp) hsp.innerHTML = "";
				}
			}

			if (articles) {
				for (var i = 0; i < articles.length; i++) {
					var a_id = articles[i]['id'];
					cache_set("article:" + a_id, articles[i]['content']);
				}
			} else {
				console.log("no cached articles received");
			}

			if (counters)
				parse_counters(counters);
			else
				request_counters(true);

		} else if (transport.responseText) {
			console.error("Invalid object received: " + transport.responseText);
			dijit.byId("headlines-frame").attr('content', "<div class='whiteBox'>" +
					__('Could not update headlines (invalid object received - see error console for details)') +
					"</div>");
		} else {
			//notify_error("Error communicating with server.");
			Element.show(dijit.byId("net-alert").domNode);
		}

		_infscroll_request_sent = 0;

		notify("");

	} catch (e) {
		exception_error("headlines_callback2", e, transport);
	}
}

function render_article(article) {
	try {
		dijit.byId("headlines-wrap-inner").addChild(
				dijit.byId("content-insert"));

		var c = dijit.byId("content-insert");

		try {
			c.domNode.scrollTop = 0;
		} catch (e) { };

		c.attr('content', article);

		correctHeadlinesOffset(getActiveArticleId());

		try {
			c.focus();
		} catch (e) { };

	} catch (e) {
		exception_error("render_article", e);
	}
}

function showArticleInHeadlines(id) {

	try {

		selectArticles("none");

		var crow = $("RROW-" + id);

		if (!crow) return;

		var article_is_unread = crow.hasClassName("Unread");

		crow.removeClassName("Unread");

		selectArticles('none');

		var view_mode = false;

		try {
			view_mode = document.forms['main_toolbar_form'].view_mode;
			view_mode = view_mode[view_mode.selectedIndex].value;
		} catch (e) {
			//
		}

		markHeadline(id);

		if (article_is_unread)
			_force_scheduled_update = true;

	} catch (e) {
		exception_error("showArticleInHeadlines", e);
	}
}

function article_callback2(transport, id) {
	try {
		console.log("article_callback2 " + id);

		handle_rpc_json(transport);

		var reply = false;

		try {
			reply = JSON.parse(transport.responseText);
		} catch (e) {
			console.error(e);
		}

		if (reply) {

			reply.each(function(article) {
				if (getActiveArticleId() == article['id']) {
					render_article(article['content']);
				}
				cids_requested.remove(article['id']);

				cache_set("article:" + article['id'], article['content']);
			});

//			if (id != last_requested_article) {
//				console.log("requested article id is out of sequence, aborting");
//				return;
//			}

		} else if (transport.responseText) {
			console.error("Invalid object received: " + transport.responseText);

			render_article("<div class='whiteBox'>" +
					__('Could not display article (invalid object received - see error console for details)') + "</div>");
		} else {
			Element.show(dijit.byId("net-alert").domNode);
		}

		var unread_in_buffer = $$("#headlines-frame > div[id*=RROW][class*=Unread]").length
		request_counters(unread_in_buffer == 0);

		headlines_scroll_handler($("headlines-frame"));

/*		try {
			if (!_infscroll_disable &&
					$$("#headlines-frame > div[id*=RROW]").last().hasClassName("Selected")) {

				loadMoreHeadlines();
			}
		} catch (e) {
			console.warn(e);
		} */

		notify("");
	} catch (e) {
		exception_error("article_callback2", e, transport);
	}
}

function view(id) {
	try {
		var crow = $("RROW-" + id);

		if (!crow) return;

		console.log("loading article: " + id);

		var cached_article = cache_get("article:" + id);

		console.log("cache check result: " + (cached_article != false));

		hideAuxDlg();

		var query = "?op=article&method=view&id=" + param_escape(id);

		var neighbor_ids = getRelativePostIds(id);

		/* only request uncached articles */

		var cids_to_request = [];

		for (var i = 0; i < neighbor_ids.length; i++) {
			if (cids_requested.indexOf(neighbor_ids[i]) == -1)
				if (!cache_get("article:" + neighbor_ids[i])) {
					cids_to_request.push(neighbor_ids[i]);
					cids_requested.push(neighbor_ids[i]);
				}
		}

		console.log("additional ids: " + cids_to_request.toString());

		query = query + "&cids=" + cids_to_request.toString();

		var article_is_unread = crow.hasClassName("Unread");

		setActiveArticleId(id);
		showArticleInHeadlines(id);

		if (cached_article && article_is_unread) {

			query = query + "&mode=prefetch";

			render_article(cached_article);

		} else if (cached_article) {

			query = query + "&mode=prefetch_old";
			render_article(cached_article);

			// if we don't need to request any relative ids, we might as well skip
			// the server roundtrip altogether
			if (cids_to_request.length == 0) {

/*				try {
					if (!_infscroll_disable &&
						$$("#headlines-frame > div[id*=RROW]").last().hasClassName("Selected")) {

							loadMoreHeadlines();
					}
				} catch (e) {
					console.warn(e);
				} */

				headlines_scroll_handler($("headlines-frame"));

				return;
			}
		}

		last_requested_article = id;

		console.log(query);

		if (article_is_unread) {
			decrementFeedCounter(getActiveFeedId(), activeFeedIsCat());
		}

		new Ajax.Request("backend.php", {
			parameters: query,
			onComplete: function(transport) {
				article_callback2(transport, id);
			} });

		return false;

	} catch (e) {
		exception_error("view", e);
	}
}

function toggleMark(id, client_only) {
	try {
		var query = "?op=rpc&id=" + id + "&method=mark";

		var img = $("FMPIC-" + id);

		if (!img) return;

		if (img.src.match("mark_unset")) {
			img.src = img.src.replace("mark_unset", "mark_set");
			img.alt = __("Unstar article");
			query = query + "&mark=1";

		} else {
			img.src = img.src.replace("mark_set", "mark_unset");
			img.alt = __("Star article");
			query = query + "&mark=0";
		}

		if (!client_only) {
			new Ajax.Request("backend.php", {
				parameters: query,
				onComplete: function(transport) {
					handle_rpc_json(transport);
				} });
		}

	} catch (e) {
		exception_error("toggleMark", e);
	}
}

function togglePub(id, client_only, no_effects, note) {
	try {
		var query = "?op=rpc&id=" + id + "&method=publ";

		if (note != undefined) {
			query = query + "&note=" + param_escape(note);
		} else {
			query = query + "&note=undefined";
		}

		var img = $("FPPIC-" + id);

		if (!img) return;

		if (img.src.match("pub_unset") || note != undefined) {
			img.src = img.src.replace("pub_unset", "pub_set");
			img.alt = __("Unpublish article");
			query = query + "&pub=1";

		} else {
			img.src = img.src.replace("pub_set", "pub_unset");
			img.alt = __("Publish article");

			query = query + "&pub=0";
		}

		if (!client_only) {
			new Ajax.Request("backend.php", {
				parameters: query,
				onComplete: function(transport) {
					handle_rpc_json(transport);
				} });
		}

	} catch (e) {
		exception_error("togglePub", e);
	}
}

function moveToPost(mode, noscroll) {

	try {

		var rows = getVisibleArticleIds();

		var prev_id = false;
		var next_id = false;

		if (!$('RROW-' + getActiveArticleId())) {
			setActiveArticleId(0);
		}

		if (!getActiveArticleId()) {
			next_id = rows[0];
			prev_id = rows[rows.length-1]
		} else {
			for (var i = 0; i < rows.length; i++) {
				if (rows[i] == getActiveArticleId()) {

					// Account for adjacent identical article ids.
					if (i > 0) prev_id = rows[i-1];

					for (var j = i+1; j < rows.length; j++) {
						if (rows[j] != getActiveArticleId()) {
							next_id = rows[j];
							break;
						}
					}
					break;
				}
			}
		}

		if (mode == "next") {
		 	if (next_id || getActiveArticleId()) {
				if (isCdmMode()) {

					var article = $("RROW-" + getActiveArticleId());
					var ctr = $("headlines-frame");

					if (!noscroll && article && article.offsetTop + article.offsetHeight >
							ctr.scrollTop + ctr.offsetHeight) {

						scrollArticle(ctr.offsetHeight/2);

					} else if (next_id) {
						cdmExpandArticle(next_id);
						cdmScrollToArticleId(next_id, noscroll);
					}

				} else if (next_id) {
					correctHeadlinesOffset(next_id);
					view(next_id, getActiveFeedId());
				}
			}
		}

		if (mode == "prev") {
			if (prev_id || getActiveArticleId()) {
				if (isCdmMode()) {

					var article = $("RROW-" + getActiveArticleId());
					var prev_article = $("RROW-" + prev_id);
					var ctr = $("headlines-frame");

					if (!noscroll && article && article.offsetTop < ctr.scrollTop) {
						scrollArticle(-ctr.offsetHeight/2);
					} else if (!noscroll && prev_article &&
							prev_article.offsetTop < ctr.scrollTop) {
						cdmExpandArticle(prev_id);
						scrollArticle(-ctr.offsetHeight/2);
					} else if (prev_id) {
						cdmExpandArticle(prev_id);
						cdmScrollToArticleId(prev_id, noscroll);
					}
				} else if (prev_id) {
					correctHeadlinesOffset(prev_id);
					view(prev_id, getActiveFeedId());
				}
			}
		}

	} catch (e) {
		exception_error("moveToPost", e);
	}
}

function toggleSelected(id, force_on) {
	try {

		var cb = dijit.byId("RCHK-" + id);
		var row = $("RROW-" + id);

		if (row) {
			if (row.hasClassName('Selected') && !force_on) {
				row.removeClassName('Selected');
				if (cb) cb.attr("checked", false);
			} else {
				row.addClassName('Selected');
				if (cb) cb.attr("checked", true);
			}
		}
	} catch (e) {
		exception_error("toggleSelected", e);
	}
}

function toggleUnread_afh(effect) {
	try {

		var elem = effect.element;
		elem.style.backgroundColor = "";

	} catch (e) {
		exception_error("toggleUnread_afh", e);
	}
}

function toggleUnread(id, cmode, effect) {
	try {

		var row = $("RROW-" + id);
		if (row) {
			if (cmode == undefined || cmode == 2) {
				if (row.hasClassName("Unread")) {
					row.removeClassName("Unread");

					if (effect) {
						new Effect.Highlight(row, {duration: 1, startcolor: "#fff7d5",
							afterFinish: toggleUnread_afh,
							queue: { position:'end', scope: 'TMRQ-' + id, limit: 1 } } );
					}

				} else {
					row.addClassName("Unread");
				}

			} else if (cmode == 0) {

				row.removeClassName("Unread");

				if (effect) {
					new Effect.Highlight(row, {duration: 1, startcolor: "#fff7d5",
						afterFinish: toggleUnread_afh,
						queue: { position:'end', scope: 'TMRQ-' + id, limit: 1 } } );
				}

			} else if (cmode == 1) {
				row.addClassName("Unread");
			}

			if (cmode == undefined) cmode = 2;

			var query = "?op=rpc&method=catchupSelected" +
				"&cmode=" + param_escape(cmode) + "&ids=" + param_escape(id);

//			notify_progress("Loading, please wait...");

			new Ajax.Request("backend.php", {
				parameters: query,
				onComplete: function(transport) {
					handle_rpc_json(transport);
				} });

		}

	} catch (e) {
		exception_error("toggleUnread", e);
	}
}

function selectionRemoveLabel(id, ids) {
	try {

		if (!ids) ids = getSelectedArticleIds2();

		if (ids.length == 0) {
			alert(__("No articles are selected."));
			return;
		}

		var query = "?op=rpc&method=removeFromLabel&ids=" +
			param_escape(ids.toString()) + "&lid=" + param_escape(id);

		console.log(query);

		new Ajax.Request("backend.php", {
			parameters: query,
			onComplete: function(transport) {
				handle_rpc_json(transport);
				show_labels_in_headlines(transport);
			} });

	} catch (e) {
		exception_error("selectionAssignLabel", e);

	}
}

function selectionAssignLabel(id, ids) {
	try {

		if (!ids) ids = getSelectedArticleIds2();

		if (ids.length == 0) {
			alert(__("No articles are selected."));
			return;
		}

		var query = "?op=rpc&method=assignToLabel&ids=" +
			param_escape(ids.toString()) + "&lid=" + param_escape(id);

		console.log(query);

		new Ajax.Request("backend.php", {
			parameters: query,
			onComplete: function(transport) {
				handle_rpc_json(transport);
				show_labels_in_headlines(transport);
			} });

	} catch (e) {
		exception_error("selectionAssignLabel", e);

	}
}

function selectionToggleUnread(set_state, callback, no_error) {
	try {
		var rows = getSelectedArticleIds2();

		if (rows.length == 0 && !no_error) {
			alert(__("No articles are selected."));
			return;
		}

		for (var i = 0; i < rows.length; i++) {
			var row = $("RROW-" + rows[i]);
			if (row) {
				if (set_state == undefined) {
					if (row.hasClassName("Unread")) {
						row.removeClassName("Unread");
					} else {
						row.addClassName("Unread");
					}
				}

				if (set_state == false) {
					row.removeClassName("Unread");
				}

				if (set_state == true) {
					row.addClassName("Unread");
				}
			}
		}

		if (rows.length > 0) {

			var cmode = "";

			if (set_state == undefined) {
				cmode = "2";
			} else if (set_state == true) {
				cmode = "1";
			} else if (set_state == false) {
				cmode = "0";
			}

			var query = "?op=rpc&method=catchupSelected" +
				"&cmode=" + cmode + "&ids=" + param_escape(rows.toString());

			notify_progress("Loading, please wait...");

			new Ajax.Request("backend.php", {
				parameters: query,
				onComplete: function(transport) {
					handle_rpc_json(transport);
					if (callback) callback(transport);
				} });

		}

	} catch (e) {
		exception_error("selectionToggleUnread", e);
	}
}

function selectionToggleMarked() {
	try {

		var rows = getSelectedArticleIds2();

		if (rows.length == 0) {
			alert(__("No articles are selected."));
			return;
		}

		for (var i = 0; i < rows.length; i++) {
			toggleMark(rows[i], true, true);
		}

		if (rows.length > 0) {

			var query = "?op=rpc&method=markSelected&ids=" +
				param_escape(rows.toString()) + "&cmode=2";

			new Ajax.Request("backend.php", {
				parameters: query,
				onComplete: function(transport) {
					handle_rpc_json(transport);
				} });

		}

	} catch (e) {
		exception_error("selectionToggleMarked", e);
	}
}

function selectionTogglePublished() {
	try {

		var rows = getSelectedArticleIds2();

		if (rows.length == 0) {
			alert(__("No articles are selected."));
			return;
		}

		for (var i = 0; i < rows.length; i++) {
			togglePub(rows[i], true, true);
		}

		if (rows.length > 0) {

			var query = "?op=rpc&method=publishSelected&ids=" +
				param_escape(rows.toString()) + "&cmode=2";

			new Ajax.Request("backend.php", {
				parameters: query,
				onComplete: function(transport) {
					handle_rpc_json(transport);
				} });

		}

	} catch (e) {
		exception_error("selectionToggleMarked", e);
	}
}

function getSelectedArticleIds2() {

	var rv = [];

	$$("#headlines-frame > div[id*=RROW][class*=Selected]").each(
		function(child) {
			rv.push(child.id.replace("RROW-", ""));
		});

	return rv;
}

function getLoadedArticleIds() {
	var rv = [];

	var children = $$("#headlines-frame > div[id*=RROW-]");

	children.each(function(child) {
			rv.push(child.id.replace("RROW-", ""));
		});

	return rv;

}

// mode = all,none,unread,invert,marked,published
function selectArticles(mode) {
	try {

		var children = $$("#headlines-frame > div[id*=RROW]");

		children.each(function(child) {
			var id = child.id.replace("RROW-", "");
			var cb = dijit.byId("RCHK-" + id);

			if (mode == "all") {
				child.addClassName("Selected");
				if (cb) cb.attr("checked", true);
			} else if (mode == "unread") {
				if (child.hasClassName("Unread")) {
					child.addClassName("Selected");
					if (cb) cb.attr("checked", true);
				} else {
					child.removeClassName("Selected");
					if (cb) cb.attr("checked", false);
				}
			} else if (mode == "marked") {
				var img = $("FMPIC-" + child.id.replace("RROW-", ""));

				if (img && img.src.match("mark_set")) {
					child.addClassName("Selected");
					if (cb) cb.attr("checked", true);
				} else {
					child.removeClassName("Selected");
					if (cb) cb.attr("checked", false);
				}
			} else if (mode == "published") {
				var img = $("FPPIC-" + child.id.replace("RROW-", ""));

				if (img && img.src.match("pub_set")) {
					child.addClassName("Selected");
					if (cb) cb.attr("checked", true);
				} else {
					child.removeClassName("Selected");
					if (cb) cb.attr("checked", false);
				}

			} else if (mode == "invert") {
				if (child.hasClassName("Selected")) {
					child.removeClassName("Selected");
					if (cb) cb.attr("checked", false);
				} else {
					child.addClassName("Selected");
					if (cb) cb.attr("checked", true);
				}

			} else {
				child.removeClassName("Selected");
				if (cb) cb.attr("checked", false);
			}
		});

	} catch (e) {
		exception_error("selectArticles", e);
	}
}

function catchupPage() {

	var fn = getFeedName(getActiveFeedId(), activeFeedIsCat());

	var str = __("Mark all visible articles in %s as read?");

	str = str.replace("%s", fn);

	if (getInitParam("confirm_feed_catchup") == 1 && !confirm(str)) {
		return;
	}

	selectArticles('all');
	selectionToggleUnread(false, 'viewCurrentFeed()', true);
	selectArticles('none');
}

function deleteSelection() {

	try {

		var rows = getSelectedArticleIds2();

		if (rows.length == 0) {
			alert(__("No articles are selected."));
			return;
		}

		var fn = getFeedName(getActiveFeedId(), activeFeedIsCat());
		var str;

		if (getActiveFeedId() != 0) {
			str = __("Delete %d selected articles in %s?");
		} else {
			str = __("Delete %d selected articles?");
		}

		str = str.replace("%d", rows.length);
		str = str.replace("%s", fn);

		if (getInitParam("confirm_feed_catchup") == 1 && !confirm(str)) {
			return;
		}

		query = "?op=rpc&method=delete&ids=" + param_escape(rows);

		console.log(query);

		new Ajax.Request("backend.php",	{
			parameters: query,
			onComplete: function(transport) {
					handle_rpc_json(transport);
					viewCurrentFeed();
				} });

	} catch (e) {
		exception_error("deleteSelection", e);
	}
}

function archiveSelection() {

	try {

		var rows = getSelectedArticleIds2();

		if (rows.length == 0) {
			alert(__("No articles are selected."));
			return;
		}

		var fn = getFeedName(getActiveFeedId(), activeFeedIsCat());
		var str;
		var op;

		if (getActiveFeedId() != 0) {
			str = __("Archive %d selected articles in %s?");
			op = "archive";
		} else {
			str = __("Move %d archived articles back?");
			op = "unarchive";
		}

		str = str.replace("%d", rows.length);
		str = str.replace("%s", fn);

		if (getInitParam("confirm_feed_catchup") == 1 && !confirm(str)) {
			return;
		}

		query = "?op=rpc&method="+op+"&ids=" + param_escape(rows);

		console.log(query);

		for (var i = 0; i < rows.length; i++) {
			cache_delete("article:" + rows[i]);
		}

		new Ajax.Request("backend.php", {
			parameters: query,
			onComplete: function(transport) {
					handle_rpc_json(transport);
					viewCurrentFeed();
				} });

	} catch (e) {
		exception_error("archiveSelection", e);
	}
}

function catchupSelection() {

	try {

		var rows = getSelectedArticleIds2();

		if (rows.length == 0) {
			alert(__("No articles are selected."));
			return;
		}

		var fn = getFeedName(getActiveFeedId(), activeFeedIsCat());

		var str = __("Mark %d selected articles in %s as read?");

		str = str.replace("%d", rows.length);
		str = str.replace("%s", fn);

		if (getInitParam("confirm_feed_catchup") == 1 && !confirm(str)) {
			return;
		}

		selectionToggleUnread(false, 'viewCurrentFeed()', true);

	} catch (e) {
		exception_error("catchupSelection", e);
	}
}

function editArticleTags(id) {
		var query = "backend.php?op=dlg&method=editArticleTags&param=" + param_escape(id);

		if (dijit.byId("editTagsDlg"))
			dijit.byId("editTagsDlg").destroyRecursive();

		dialog = new dijit.Dialog({
			id: "editTagsDlg",
			title: __("Edit article Tags"),
			style: "width: 600px",
			execute: function() {
				if (this.validate()) {
					var query = dojo.objectToQuery(this.attr('value'));

					notify_progress("Saving article tags...", true);

					new Ajax.Request("backend.php",	{
					parameters: query,
					onComplete: function(transport) {
						notify('');
						dialog.hide();

						var data = JSON.parse(transport.responseText);

						if (data) {
							var tags_str = article.tags;
							var id = tags_str.id;

							var tags = $("ATSTR-" + id);
							var tooltip = dijit.byId("ATSTRTIP-" + id);

							if (tags) tags.innerHTML = tags_str.content;
							if (tooltip) tooltip.attr('label', tags_str.content_full);

							cache_delete("article:" + id);
						}

					}});
				}
			},
			href: query,
		});

		var tmph = dojo.connect(dialog, 'onLoad', function() {
	   	dojo.disconnect(tmph);

			new Ajax.Autocompleter('tags_str', 'tags_choices',
			   "backend.php?op=rpc&method=completeTags",
			   { tokens: ',', paramName: "search" });
		});

		dialog.show();

}

function cdmScrollToArticleId(id, force) {
	try {
		var ctr = $("headlines-frame");
		var e = $("RROW-" + id);

		if (!e || !ctr) return;

		if (force || e.offsetTop+e.offsetHeight > (ctr.scrollTop+ctr.offsetHeight) ||
				e.offsetTop < ctr.scrollTop) {
			ctr.scrollTop = e.offsetTop;
		}

	} catch (e) {
		exception_error("cdmScrollToArticleId", e);
	}
}

function setActiveArticleId(id) {
	_active_article_id = id;
}

function getActiveArticleId() {
	return _active_article_id;
}

function postMouseIn(id) {
	post_under_pointer = id;
}

function postMouseOut(id) {
	post_under_pointer = false;
}

function headlines_scroll_handler(e) {
	try {
		var hsp = $("headlines-spacer");

		if (!_infscroll_disable) {
			if ((hsp && e.scrollTop + e.offsetHeight >= hsp.offsetTop - hsp.offsetHeight) ||
					(e.scrollHeight != 0 &&
					 	((e.scrollTop + e.offsetHeight) / e.scrollHeight >= 0.7))) {

				if (hsp)
					hsp.innerHTML = "<img src='images/indicator_tiny.gif'> " +
						__("Loading, please wait...");

				loadMoreHeadlines();
				return;

			}
		} else {
			if (hsp) hsp.innerHTML = "";
		}

		if (getInitParam("cdm_auto_catchup") == 1) {

			$$("#headlines-frame > div[id*=RROW][class*=Unread]").each(
				function(child) {
					if ($("headlines-frame").scrollTop >
							(child.offsetTop + child.offsetHeight/2)) {

						var id = child.id.replace("RROW-", "");

						if (catchup_id_batch.indexOf(id) == -1)
							catchup_id_batch.push(id);

						//console.log("auto_catchup_batch: " + catchup_id_batch.toString());
					}
				});

			if (catchup_id_batch.length > 0) {
				window.clearTimeout(catchup_timeout_id);

				if (!_infscroll_request_sent) {
					catchup_timeout_id = window.setTimeout('catchupBatchedArticles()',
						2000);
				}
			}
		}

	} catch (e) {
		console.warn("headlines_scroll_handler: " + e);
	}
}

function catchupBatchedArticles() {
	try {
		if (catchup_id_batch.length > 0 && !_infscroll_request_sent) {

			// make a copy of the array
			var batch = catchup_id_batch.slice();
			var query = "?op=rpc&method=catchupSelected" +
				"&cmode=0&ids=" + param_escape(batch.toString());

			console.log(query);

			new Ajax.Request("backend.php", {
				parameters: query,
				onComplete: function(transport) {
					handle_rpc_json(transport);

					batch.each(function(id) {
						var elem = $("RROW-" + id);
						if (elem) elem.removeClassName("Unread");
						catchup_id_batch.remove(id);
					});

				} });
		}

	} catch (e) {
		exception_error("catchupBatchedArticles", e);
	}
}

function catchupRelativeToArticle(below, id) {

	try {

		if (!id) id = getActiveArticleId();

		if (!id) {
			alert(__("No article is selected."));
			return;
		}

		var visible_ids = getVisibleArticleIds();

		var ids_to_mark = new Array();

		if (!below) {
			for (var i = 0; i < visible_ids.length; i++) {
				if (visible_ids[i] != id) {
					var e = $("RROW-" + visible_ids[i]);

					if (e && e.hasClassName("Unread")) {
						ids_to_mark.push(visible_ids[i]);
					}
				} else {
					break;
				}
			}
		} else {
			for (var i = visible_ids.length-1; i >= 0; i--) {
				if (visible_ids[i] != id) {
					var e = $("RROW-" + visible_ids[i]);

					if (e && e.hasClassName("Unread")) {
						ids_to_mark.push(visible_ids[i]);
					}
				} else {
					break;
				}
			}
		}

		if (ids_to_mark.length == 0) {
			alert(__("No articles found to mark"));
		} else {
			var msg = __("Mark %d article(s) as read?").replace("%d", ids_to_mark.length);

			if (getInitParam("confirm_feed_catchup") != 1 || confirm(msg)) {

				for (var i = 0; i < ids_to_mark.length; i++) {
					var e = $("RROW-" + ids_to_mark[i]);
					e.removeClassName("Unread");
				}

				var query = "?op=rpc&method=catchupSelected" +
					"&cmode=0" + "&ids=" + param_escape(ids_to_mark.toString());

				new Ajax.Request("backend.php", {
					parameters: query,
					onComplete: function(transport) {
						handle_rpc_json(transport);
					} });

			}
		}

	} catch (e) {
		exception_error("catchupRelativeToArticle", e);
	}
}

function cdmExpandArticle(id) {
	try {

		hideAuxDlg();

		var elem = $("CICD-" + getActiveArticleId());

		if (id == getActiveArticleId() && Element.visible(elem))
			return true;

		selectArticles("none");

		var old_offset = $("RROW-" + id).offsetTop;

		if (getActiveArticleId() && elem && !getInitParam("cdm_expanded")) {
		  	Element.hide(elem);
			Element.show("CEXC-" + getActiveArticleId());
		}

		setActiveArticleId(id);

		elem = $("CICD-" + id);

		if (!Element.visible(elem)) {
			Element.show(elem);
			Element.hide("CEXC-" + id);
		}

		/* var new_offset = $("RROW-" + id).offsetTop;

		$("headlines-frame").scrollTop += (new_offset-old_offset);

		if ($("RROW-" + id).offsetTop != old_offset)
			$("headlines-frame").scrollTop = new_offset; */

		toggleUnread(id, 0, true);
		toggleSelected(id);

	} catch (e) {
		exception_error("cdmExpandArticle", e);
	}

	return false;
}

function fixHeadlinesOrder(ids) {
	try {
		for (var i = 0; i < ids.length; i++) {
			var e = $("RROW-" + ids[i]);

			if (e) {
				if (i % 2 == 0) {
					e.removeClassName("even");
					e.addClassName("odd");
				} else {
					e.removeClassName("odd");
					e.addClassName("even");
				}
			}
		}
	} catch (e) {
		exception_error("fixHeadlinesOrder", e);
	}
}

function getArticleUnderPointer() {
	return post_under_pointer;
}

function scrollArticle(offset) {
	try {
		if (!isCdmMode()) {
			var ci = $("content-insert");
			if (ci) {
				ci.scrollTop += offset;
			}
		} else {
			var hi = $("headlines-frame");
			if (hi) {
				hi.scrollTop += offset;
			}

		}
	} catch (e) {
		exception_error("scrollArticle", e);
	}
}

function show_labels_in_headlines(transport) {
	try {
		var data = JSON.parse(transport.responseText);

		if (data) {
			data['info-for-headlines'].each(function(elem) {
				var ctr = $("HLLCTR-" + elem.id);

				if (ctr) ctr.innerHTML = elem.labels;
			});
		}
	} catch (e) {
		exception_error("show_labels_in_headlines", e);
	}
}

function dismissArticle(id) {
	try {
		var elem = $("RROW-" + id);

		toggleUnread(id, 0, true);

		new Effect.Fade(elem, {duration : 0.5});

		if (id == getActiveArticleId()) {
			setActiveArticleId(0);
		}

	} catch (e) {
		exception_error("dismissArticle", e);
	}
}

function dismissSelectedArticles() {
	try {

		var ids = getVisibleArticleIds();
		var tmp = [];
		var sel = [];

		for (var i = 0; i < ids.length; i++) {
			var elem = $("RROW-" + ids[i]);

			if (elem.className && elem.hasClassName("Selected") &&
					ids[i] != getActiveArticleId()) {
				new Effect.Fade(elem, {duration : 0.5});
				sel.push(ids[i]);
			} else {
				tmp.push(ids[i]);
			}
		}

		if (sel.length > 0)
			selectionToggleUnread(false);

		fixHeadlinesOrder(tmp);

	} catch (e) {
		exception_error("dismissSelectedArticles", e);
	}
}

function dismissReadArticles() {
	try {

		var ids = getVisibleArticleIds();
		var tmp = [];

		for (var i = 0; i < ids.length; i++) {
			var elem = $("RROW-" + ids[i]);

			if (elem.className && !elem.hasClassName("Unread") &&
					!elem.hasClassName("Selected")) {

				new Effect.Fade(elem, {duration : 0.5});
			} else {
				tmp.push(ids[i]);
			}
		}

		fixHeadlinesOrder(tmp);

	} catch (e) {
		exception_error("dismissSelectedArticles", e);
	}
}

function getVisibleArticleIds() {
	var ids = [];

	try {

		getLoadedArticleIds().each(function(id) {
			var elem = $("RROW-" + id);
			if (elem && Element.visible(elem))
				ids.push(id);
			});

	} catch (e) {
		exception_error("getVisibleArticleIds", e);
	}

	return ids;
}

function cdmClicked(event, id) {
	try {
		//var shift_key = event.shiftKey;

		hideAuxDlg();

		if (!event.ctrlKey) {

			if (!getInitParam("cdm_expanded")) {
				return cdmExpandArticle(id);
			} else {

				selectArticles("none");
				toggleSelected(id);

				var elem = $("RROW-" + id);
				var article_is_unread = elem.hasClassName("Unread");

				if (elem)
					elem.removeClassName("Unread");

				setActiveArticleId(id);

				if (article_is_unread) {
					decrementFeedCounter(getActiveFeedId(), activeFeedIsCat());
				}

				var query = "?op=rpc&method=catchupSelected" +
					"&cmode=0&ids=" + param_escape(id);

				new Ajax.Request("backend.php", {
					parameters: query,
					onComplete: function(transport) {
						handle_rpc_json(transport);
					} });

				return !event.shiftKey;
			}

		} else {
			toggleSelected(id, true);

			var elem = $("RROW-" + id);
			var article_is_unread = elem.hasClassName("Unread");

			if (article_is_unread) {
				decrementFeedCounter(getActiveFeedId(), activeFeedIsCat());
			}

			toggleUnread(id, 0, false);

			openArticleInNewWindow(id);
		}

		var unread_in_buffer = $$("#headlines-frame > div[id*=RROW][class*=Unread]").length
		request_counters(unread_in_buffer == 0);

	} catch (e) {
		exception_error("cdmClicked");
	}

	return false;
}

function hlClicked(event, id) {
	try {
		if (event.which == 2) {
			view(id);
			return true;
		} else if (event.ctrlKey) {
			toggleSelected(id, true);
			toggleUnread(id, 0, false);
			openArticleInNewWindow(id);
			return false;
		} else {
			view(id);
			return false;
		}

	} catch (e) {
		exception_error("hlClicked");
	}
}

function getFirstVisibleHeadlineId() {
	var rows = getVisibleArticleIds();
	return rows[0];

}

function getLastVisibleHeadlineId() {
	var rows = getVisibleArticleIds();
	return rows[rows.length-1];
}

function openArticleInNewWindow(id) {
	toggleUnread(id, 0, false);
	window.open("backend.php?op=article&method=redirect&id=" + id);
}

function isCdmMode() {
	return getInitParam("combined_display_mode");
}

function markHeadline(id) {
	var row = $("RROW-" + id);
	if (row) {
		var check = dijit.byId("RCHK-" + id);

		if (check) {
			check.attr("checked", true);
		}

		row.addClassName("Selected");
	}
}

function getRelativePostIds(id, limit) {

	var tmp = [];

	try {

		if (!limit) limit = 6; //3

		var ids = getVisibleArticleIds();

		for (var i = 0; i < ids.length; i++) {
			if (ids[i] == id) {
				for (var k = 1; k <= limit; k++) {
					//if (i > k-1) tmp.push(ids[i-k]);
					if (i < ids.length-k) tmp.push(ids[i+k]);
				}
				break;
			}
		}

	} catch (e) {
		exception_error("getRelativePostIds", e);
	}

	return tmp;
}

function correctHeadlinesOffset(id) {

	try {

		var container = $("headlines-frame");
		var row = $("RROW-" + id);

		if (!container || !row) return;

		var viewport = container.offsetHeight;

		var rel_offset_top = row.offsetTop - container.scrollTop;
		var rel_offset_bottom = row.offsetTop + row.offsetHeight - container.scrollTop;

		//console.log("Rtop: " + rel_offset_top + " Rbtm: " + rel_offset_bottom);
		//console.log("Vport: " + viewport);

		if (rel_offset_top <= 0 || rel_offset_top > viewport) {
			container.scrollTop = row.offsetTop;
		} else if (rel_offset_bottom > viewport) {

			/* doesn't properly work with Opera in some cases because
				Opera fucks up element scrolling */

			container.scrollTop = row.offsetTop + row.offsetHeight - viewport;
		}

	} catch (e) {
		exception_error("correctHeadlinesOffset", e);
	}

}

function headlineActionsChange(elem) {
	try {
		eval(elem.value);
		elem.attr('value', 'false');
	} catch (e) {
		exception_error("headlineActionsChange", e);
	}
}

function closeArticlePanel() {

	if (dijit.byId("content-insert"))
		dijit.byId("headlines-wrap-inner").removeChild(
			dijit.byId("content-insert"));
}

function initHeadlinesMenu() {
	try {
		if (dijit.byId("headlinesMenu"))
			dijit.byId("headlinesMenu").destroyRecursive();

		var ids = [];

		if (!isCdmMode()) {
			nodes = $$("#headlines-frame > div[id*=RROW]");
		} else {
			nodes = $$("#headlines-frame span[id*=RTITLE]");
		}

		nodes.each(function(node) {
			ids.push(node.id);
		});

		var menu = new dijit.Menu({
			id: "headlinesMenu",
			targetNodeIds: ids,
		});

		var tmph = dojo.connect(menu, '_openMyself', function (event) {
			var callerNode = event.target, match = null, tries = 0;

			while (match == null && callerNode && tries <= 3) {
				match = callerNode.id.match("^[A-Z]+[-]([0-9]+)$");
				callerNode = callerNode.parentNode;
				++tries;
			}

			if (match) this.callerRowId = parseInt(match[1]);

		});

/*		if (!isCdmMode())
			menu.addChild(new dijit.MenuItem({
				label: __("View article"),
				onClick: function(event) {
					view(this.getParent().callerRowId);
				}})); */

		menu.addChild(new dijit.MenuItem({
			label: __("Open original article"),
			onClick: function(event) {
				openArticleInNewWindow(this.getParent().callerRowId);
			}}));

		menu.addChild(new dijit.MenuSeparator());

		menu.addChild(new dijit.MenuItem({
			label: __("Mark above as read"),
			onClick: function(event) {
				catchupRelativeToArticle(0, this.getParent().callerRowId);
				}}));

		menu.addChild(new dijit.MenuItem({
			label: __("Mark below as read"),
			onClick: function(event) {
				catchupRelativeToArticle(1, this.getParent().callerRowId);
				}}));


		var labels = dijit.byId("feedTree").model.getItemsInCategory(-2);

		if (labels) {

			menu.addChild(new dijit.MenuSeparator());

			var labelAddMenu = new dijit.Menu({ownerMenu: menu});
			var labelDelMenu = new dijit.Menu({ownerMenu: menu});

			labels.each(function(label) {
				var id = label.id[0];
				var bare_id = id.substr(id.indexOf(":")+1);
				var name = label.name[0];

				bare_id = -11-bare_id;

				labelAddMenu.addChild(new dijit.MenuItem({
					label: name,
					labelId: bare_id,
					onClick: function(event) {
						var ids = getSelectedArticleIds2();
						// cast to string
						var id = this.getParent().ownerMenu.callerRowId + "";

						ids = ids.size() != 0 && ids.indexOf(id) != -1 ? ids : [id];

						selectionAssignLabel(this.labelId, ids);
				}}));

				labelDelMenu.addChild(new dijit.MenuItem({
					label: name,
					labelId: bare_id,
					onClick: function(event) {
						var ids = getSelectedArticleIds2();
						// cast to string
						var id = this.getParent().ownerMenu.callerRowId + "";

						ids = ids.size() != 0 && ids.indexOf(id) != -1 ? ids : [id];

						selectionRemoveLabel(this.labelId, ids);
				}}));

			});

			menu.addChild(new dijit.PopupMenuItem({
				label: __("Assign label"),
				popup: labelAddMenu,
			}));

			menu.addChild(new dijit.PopupMenuItem({
				label: __("Remove label"),
				popup: labelDelMenu,
			}));

		}

		menu.startup();

	} catch (e) {
		exception_error("initHeadlinesMenu", e);
	}
}


function player(elem) {
	var aid = elem.getAttribute("audio-id");
	var status = elem.getAttribute("status");

	var audio = $(aid);

	if (audio) {
		if (status == 0) {
			audio.play();
			status = 1;
			elem.innerHTML = __("Playing...");
			elem.title = __("Click to pause");
			elem.addClassName("playing");
		} else {
			audio.pause();
			status = 0;
			elem.innerHTML = __("Play");
			elem.title = __("Click to play");
			elem.removeClassName("playing");
		}

		elem.setAttribute("status", status);
	} else {
		alert("Your browser doesn't seem to support HTML5 audio.");
	}
}

function cache_set(id, obj) {
	//console.log("cache_set: " + id);
	if (has_storage)
		try {
			sessionStorage[id] = obj;
		} catch (e) {
			sessionStorage.clear();
		}
}

function cache_get(id) {
	if (has_storage)
		return sessionStorage[id];
}

function cache_clear() {
	if (has_storage)
		sessionStorage.clear();
}

function cache_delete(id) {
	if (has_storage)
		sessionStorage.removeItem(id);
}

function cancelSearch() {
	try {
		_search_query = "";
		viewCurrentFeed();
	} catch (e) {
		exception_error("cancelSearch", e);
	}
}

function setSelectionScore() {
	try {
		var ids = getSelectedArticleIds2();

		if (ids.length > 0) {
			console.log(ids);

			var score = prompt(__("Please enter new score for selected articles:"), score);

			if (score != undefined) {
				var query = "op=rpc&method=setScore&id=" + param_escape(ids.toString()) +
					"&score=" + param_escape(score);

				new Ajax.Request("backend.php", {
					parameters: query,
					onComplete: function(transport) {
						var reply = JSON.parse(transport.responseText);
						if (reply) {
							console.log(ids);

							ids.each(function(id) {
								var row = $("RROW-" + id);

								if (row) {
									var pic = row.getElementsByClassName("hlScorePic")[0];

									if (pic) {
										pic.src = pic.src.replace(/score_.*?\.png/,
											reply["score_pic"]);
										pic.setAttribute("score", score);
									}
								}
							});
						}
					} });
			}

		} else {
			alert(__("No articles are selected."));
		}
	} catch (e) {
		exception_error("setSelectionScore", e);
	}
}

function changeScore(id, pic) {
	try {
		var score = pic.getAttribute("score");

		var new_score = prompt(__("Please enter new score for this article:"), score);

		if (new_score != undefined) {

			var query = "op=rpc&method=setScore&id=" + param_escape(id) +
				"&score=" + param_escape(new_score);

			new Ajax.Request("backend.php", {
				parameters: query,
				onComplete: function(transport) {
					var reply = JSON.parse(transport.responseText);

					if (reply) {
						pic.src = pic.src.replace(/score_.*?\.png/, reply["score_pic"]);
						pic.setAttribute("score", new_score);
					}
				} });
		}
	} catch (e) {
		exception_error("changeScore", e);
	}
}
