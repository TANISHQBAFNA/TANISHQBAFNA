/**
 * ProjectDetail — live folder opens as a centered manila flip book.
 * ---------------------------------------------------------------------------
 * Softboard is gone. The folder leaves the rail, grows from its center to
 * the center of the viewport, and only then does the cover hinge open.
 * One leaf is hinged at the spine: front is the current right-hand media,
 * back is the next page's text, and the sheet underneath is the next media.
 * The counter advances when the turn settles, not when Next is pressed.
 * Escape / Home returns that one folder. Non-live folders never open.
 */
window.ProjectDetail = (function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var OPEN_MS = 880;
  var COVER_MS = 700;
  var CLOSE_MS = 760;
  var FLIP_MS = 1120;

  function create(options) {
    var panel = options.panel;
    var stage = options.stage;
    var projects = options.projects;

    var nodes = {
      card: panel.querySelector('[data-detail-card]'),
      title: panel.querySelector('[data-detail-title]'),
      shell: panel.querySelector('[data-case-shell]'),
      book: panel.querySelector('[data-case-book]'),
      leaf: panel.querySelector('[data-leaf]'),
      leftPage: panel.querySelector('[data-left-page]'),
      frontPage: panel.querySelector('[data-front-page]'),
      backPage: panel.querySelector('[data-back-page]'),
      underPage: panel.querySelector('[data-under-page]'),
      pageTitle: panel.querySelector('[data-page-title]'),
      faceYear: panel.querySelector('[data-case-face-year]'),
      coverTitle: panel.querySelector('[data-case-cover-title]'),
      coverCat: panel.querySelector('[data-case-cover-cat]')
    };

    var openIndex = -1;
    var mode = 'off';
    var slideIndex = 0;
    var slides = [];
    var lastTrigger = null;
    var closeTimer = null;
    var openTimer = null;
    var flipping = false;
    var flipAnim = null;
    var flipTimer = null;
    var drag = {
      tracking: false,
      pointerId: null,
      startX: 0,
      armed: null
    };

    function pad(n) {
      return String(n).length < 2 ? '0' + n : String(n);
    }

    function isLive(project) {
      return !!(project && project.status === 'live');
    }

    function slidesFor(project) {
      if (project.slides && project.slides.length) return project.slides;
      return [{ title: 'Overview', headline: project.title, body: project.detail || project.blurb || '' }];
    }

    function writeText(node, text) {
      node.textContent = '';
      String(text == null ? '' : text).split(/\*([^*]+)\*/).forEach(function (part, i) {
        if (!part) return;
        if (i % 2) {
          var em = document.createElement('em');
          em.textContent = part;
          node.appendChild(em);
        } else {
          node.appendChild(document.createTextNode(part));
        }
      });
    }

    function cancelFlipAnim() {
      clearTimeout(flipTimer);
      flipTimer = null;
      if (flipAnim) {
        try { flipAnim.cancel(); } catch (err) {}
        flipAnim = null;
      }
    }

    function makeSticky(tools) {
      var note = document.createElement('aside');
      note.className = 'case-page__sticky';
      note.setAttribute('aria-label', 'Tools');
      var label = document.createElement('span');
      label.className = 'case-page__sticky-label';
      label.textContent = 'Tools';
      note.appendChild(label);
      var list = document.createElement('ul');
      list.className = 'case-page__sticky-list';
      tools.forEach(function (tool) {
        var li = document.createElement('li');
        li.textContent = tool;
        list.appendChild(li);
      });
      note.appendChild(list);
      return note;
    }

    function makeImage(entry) {
      var item = typeof entry === 'string' ? { src: entry } : (entry || {});
      var figure = document.createElement('figure');
      figure.className = 'case-page__photo';
      if (item.frame === 'device') figure.classList.add('is-device');
      if (!item.src) {
        figure.classList.add('is-empty');
        return figure;
      }
      var img = document.createElement('img');
      img.src = item.src;
      img.alt = item.alt || '';
      img.loading = 'eager';
      img.decoding = 'async';
      figure.appendChild(img);
      if (item.caption) {
        var cap = document.createElement('figcaption');
        cap.textContent = item.caption;
        figure.appendChild(cap);
      }
      return figure;
    }

    function appendText(parent, slide, index, project) {
      var kicker = document.createElement('p');
      kicker.className = 'case-page__kicker';
      kicker.textContent = slide.title || ('Page ' + pad(index + 1));
      parent.appendChild(kicker);

      var headline = document.createElement('h3');
      headline.className = 'case-page__headline';
      writeText(headline, slide.headline || slide.title || project.title);
      parent.appendChild(headline);

      if (slide.body) {
        var body = document.createElement('p');
        body.className = 'case-page__body';
        writeText(body, slide.body);
        parent.appendChild(body);
      }

      if (index === 0 && (project.tools || []).length) {
        parent.appendChild(makeSticky(project.tools));
      }
    }

    function makeMediaFace(slide) {
      var front = document.createElement('div');
      front.className = 'case-page case-page--media';
      var images = (slide && slide.images) || [];
      if (!images.length) {
        front.classList.add('is-empty');
        return front;
      }
      var gallery = document.createElement('div');
      gallery.className = 'case-page__gallery';
      gallery.classList.toggle('is-single', images.length === 1);
      images.forEach(function (img) {
        gallery.appendChild(makeImage(img));
      });
      front.appendChild(gallery);
      return front;
    }

    function currentProject() {
      return projects[openIndex] || {};
    }

    function clearSlot(el) {
      if (!el) return;
      el.textContent = '';
    }

    function fillText(el, slide, index) {
      if (!el) return;
      el.textContent = '';
      if (!slide) return;
      el.classList.add('case-page', 'case-page--text');
      appendText(el, slide, index, currentProject());
    }

    function fillMedia(el, slide) {
      if (!el) return;
      el.textContent = '';
      el.appendChild(makeMediaFace(slide || {}));
    }

    function setTurning(on) {
      if (!nodes.book) return;
      nodes.book.classList.toggle('is-turning', !!on);
    }

    function restLeaf() {
      if (!nodes.leaf) return;
      nodes.leaf.style.transform = '';
      nodes.leaf.style.transition = '';
    }

    /* left = this text, leaf front = this media, leaf back = next text, under = next media */
    function paintSpread(index) {
      var here = slides[index];
      var next = slides[index + 1] || null;
      fillText(nodes.leftPage, here, index);
      fillMedia(nodes.frontPage, here);
      fillText(nodes.backPage, next, next ? index + 1 : index);
      fillMedia(nodes.underPage, next || {});
      if (nodes.book) nodes.book.setAttribute('data-index', String(index));
      if (nodes.pageTitle) {
        nodes.pageTitle.textContent = here ? (here.headline || here.title || '') : '';
      }
    }

    function notifySlide(index) {
      if (options.onSlideChange) options.onSlideChange(index, slides.length);
    }

    function paintSlideState(index) {
      slideIndex = index;
      cancelFlipAnim();
      flipping = false;
      if (nodes.book) nodes.book.classList.remove('is-hold');
      setTurning(false);
      if (nodes.book) nodes.book.classList.add('is-instant');
      restLeaf();
      paintSpread(index);
      if (nodes.leaf) void nodes.leaf.offsetWidth;
      if (nodes.book) nodes.book.classList.remove('is-instant');
      notifySlide(index);
    }

    function settleFlip(index) {
      clearTimeout(flipTimer);
      flipTimer = null;
      if (mode !== 'case') {
        flipping = false;
        flipAnim = null;
        return;
      }
      /* Swap to the settled spread before releasing the turned pose, so the
         browser paints angle 0 and the new faces in the same frame. */
      if (nodes.book) nodes.book.classList.add('is-instant');
      paintSpread(index);
      cancelFlipAnim();
      restLeaf();
      slideIndex = index;
      flipping = false;
      setTurning(false);
      if (nodes.book) nodes.book.classList.remove('is-hold');
      if (nodes.leaf) void nodes.leaf.offsetWidth;
      if (nodes.book) nodes.book.classList.remove('is-instant');
      notifySlide(index);
    }

    function armFlipSettle(to) {
      clearTimeout(flipTimer);
      flipTimer = setTimeout(function () {
        flipTimer = null;
        if (mode === 'case' && flipping) settleFlip(to);
      }, FLIP_MS + 140);
    }

    /* Dwell around 70–110° so the edge, verso, and page underneath read as paper. */
    function turnKeyframes(forward) {
      var poses = forward
        ? [0, -36, -70, -70, -92, -110, -110, -146, -180]
        : [-180, -146, -110, -110, -92, -70, -70, -36, 0];
      var offsets = [0, 0.12, 0.26, 0.40, 0.50, 0.60, 0.74, 0.88, 1];
      return poses.map(function (deg, i) {
        var abs = Math.abs(deg);
        var lift = Math.sin((abs * Math.PI) / 180) * 8;
        if (abs > 84 && abs < 100) lift = 2;
        return {
          transform: 'rotateY(' + deg + 'deg) translateZ(' + lift.toFixed(1) + 'px)',
          offset: offsets[i]
        };
      });
    }

    function flipToSlide(from, to) {
      if (!nodes.leaf || !nodes.book) {
        paintSlideState(to);
        return;
      }

      flipping = true;
      cancelFlipAnim();
      flipping = true;
      setTurning(true);
      /* Counter stays on `from` until settleFlip. */

      var forward = to > from;
      nodes.book.classList.add('is-instant');
      nodes.book.classList.remove('is-hold');

      if (forward) {
        paintSpread(from);
        nodes.leaf.style.transform = 'rotateY(0deg)';
      } else {
        /* Leaf already lies on the left: its back is the page we are leaving. */
        fillText(nodes.leftPage, slides[to], to);
        fillMedia(nodes.frontPage, slides[to]);
        fillText(nodes.backPage, slides[from], from);
        fillMedia(nodes.underPage, slides[from] || {});
        nodes.leaf.style.transform = 'rotateY(-180deg)';
      }
      void nodes.leaf.offsetWidth;
      nodes.book.classList.remove('is-instant');

      flipAnim = nodes.leaf.animate(turnKeyframes(forward), {
        duration: FLIP_MS,
        easing: 'linear',
        fill: 'forwards'
      });

      function done() {
        if (!flipping) return;
        settleFlip(to);
      }
      flipAnim.onfinish = done;
      flipAnim.addEventListener('finish', done);
      armFlipSettle(to);
    }

    function goToSlide(index, animate) {
      if (mode !== 'case') return;
      if (flipping) return;
      var bounded = Math.max(0, Math.min(slides.length - 1, index));
      var from = slideIndex;
      if (bounded === from) return;
      var shouldAnimate = animate !== false && !reduceMotion.matches;
      if (shouldAnimate && Math.abs(bounded - from) === 1) {
        flipToSlide(from, bounded);
        return;
      }
      paintSlideState(bounded);
    }

    function stepSlide(direction) {
      goToSlide(slideIndex + direction, true);
    }

    function holdMidFlip() {
      if (mode !== 'case' || slides.length < 2 || !nodes.leaf) return;
      cancelFlipAnim();
      paintSlideState(0);
      setTurning(true);
      nodes.book.classList.add('is-hold');
      nodes.leaf.style.transition = 'none';
      nodes.leaf.style.transform = 'rotateY(-84deg) translateZ(6px)';
      flipping = true;
    }

    function paintFace(project) {
      if (nodes.coverTitle) nodes.coverTitle.textContent = project.title || '';
      if (nodes.faceYear) nodes.faceYear.textContent = project.year || '';
      if (nodes.coverCat) nodes.coverCat.textContent = project.category || '';
      if (nodes.shell) {
        if (project.tone) nodes.shell.dataset.tone = project.tone;
        else delete nodes.shell.dataset.tone;
      }
    }

    function rectOf(el) {
      if (!el || typeof el.getBoundingClientRect !== 'function') return null;
      var r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return null;
      return r;
    }

    function clearFlyStyles(el) {
      if (!el) return;
      el.style.position = '';
      el.style.left = '';
      el.style.top = '';
      el.style.width = '';
      el.style.height = '';
      el.style.margin = '';
      el.style.transform = '';
      el.style.transformOrigin = '';
      el.style.transition = '';
      el.style.zIndex = '';
      el.style.visibility = '';
      el.style.opacity = '';
    }

    function centerDelta(src, dest) {
      var sx = src.left + src.width / 2;
      var sy = src.top + src.height / 2;
      var dx = dest.left + dest.width / 2;
      var dy = dest.top + dest.height / 2;
      return {
        x: sx - dx,
        y: sy - dy,
        scaleX: src.width / Math.max(dest.width, 1),
        scaleY: src.height / Math.max(dest.height, 1)
      };
    }

    function folderFrom(trigger) {
      if (!trigger) return null;
      if (trigger.classList && trigger.classList.contains('folder')) return trigger;
      return trigger.closest ? trigger.closest('.folder') : null;
    }

    function flyFromRail(trigger) {
      var shell = nodes.shell;
      if (!shell) return;
      var folder = folderFrom(trigger);
      var src = rectOf(folder) || rectOf(trigger);
      if (!src || reduceMotion.matches) {
        panel.classList.add('is-open', 'is-flipped');
        return;
      }

      /* Beat 1: full-size shell, cover still shut, scaled about its own center
         so the rail folder's center lands on the book's center. */
      panel.classList.add('is-flying', 'is-open');
      panel.classList.remove('is-flipped');
      shell.style.transition = 'none';
      shell.style.transformOrigin = '50% 50%';
      void shell.offsetWidth;

      var dest = rectOf(shell);
      if (!dest) {
        panel.classList.add('is-open', 'is-flipped');
        panel.classList.remove('is-flying');
        return;
      }

      var map = centerDelta(src, dest);
      shell.style.zIndex = '90';
      shell.style.transform =
        'translate(' + map.x.toFixed(1) + 'px,' + map.y.toFixed(1) + 'px) scale(' +
        map.scaleX.toFixed(4) + ',' + map.scaleY.toFixed(4) + ')';
      void shell.offsetWidth;

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (mode !== 'case') return;
          shell.style.transition =
            'transform ' + (OPEN_MS / 1000) + 's cubic-bezier(.22,.72,.16,1)';
          shell.style.transform = 'translate(0px, 0px) scale(1, 1)';
        });
      });

      clearTimeout(openTimer);
      /* Beat 2: cover hinges only after the shell has settled at center. */
      openTimer = setTimeout(function () {
        openTimer = null;
        if (mode !== 'case') return;
        clearFlyStyles(shell);
        panel.classList.remove('is-flying');
        panel.classList.add('is-flipped');
      }, OPEN_MS + 40);
    }

    function flyToRail(trigger, coverOpen) {
      var shell = nodes.shell;
      var folder = folderFrom(trigger) || trigger;
      panel.classList.remove('is-flipped');
      panel.classList.remove('is-flying');

      if (!shell || !folder || reduceMotion.matches) return;

      /* Cover shuts at center first. The rail copy stays hidden (is-current)
         until the shell lands, so the return is one folder, not a ghost. */
      var wait = coverOpen ? Math.round(COVER_MS * 0.72) : 0;
      setTimeout(function () {
        if (mode !== 'case' || !shell || !folder) return;
        clearFlyStyles(shell);
        panel.classList.add('is-open');
        shell.style.transition = 'none';
        shell.style.transform = 'none';
        shell.style.transformOrigin = '50% 50%';
        void shell.offsetWidth;
        var src = rectOf(shell);
        var dest = rectOf(folder);
        if (!src || !dest) return;

        var map = centerDelta(dest, src);
        shell.style.zIndex = '95';
        shell.style.transition =
          'transform ' + (CLOSE_MS / 1000) + 's cubic-bezier(.22,.8,.18,1)';
        shell.style.transform =
          'translate(' + map.x.toFixed(1) + 'px,' + map.y.toFixed(1) + 'px) scale(' +
          map.scaleX.toFixed(4) + ',' + map.scaleY.toFixed(4) + ')';
      }, wait);
    }

    function finishHome(fromCase) {
      clearTimeout(closeTimer);
      clearTimeout(openTimer);
      openTimer = null;
      cancelFlipAnim();
      flipping = false;
      mode = 'off';
      openIndex = -1;
      slides = [];
      slideIndex = 0;
      panel.classList.remove('is-home', 'is-flying', 'hide-folder', 'is-open', 'is-flipped');
      panel.removeAttribute('data-case');
      stage.classList.add('is-home');
      stage.classList.remove('is-detail', 'is-returning', 'rail-away', 'hero-away');
      if (nodes.card) nodes.card.hidden = true;
      clearFlyStyles(nodes.shell);
      if (nodes.book) nodes.book.classList.remove('is-turning', 'is-hold', 'is-instant');
      restLeaf();
      [nodes.leftPage, nodes.frontPage, nodes.backPage, nodes.underPage].forEach(clearSlot);
      if (nodes.title) nodes.title.textContent = '';
      if (nodes.pageTitle) nodes.pageTitle.textContent = '';
      setTurning(false);
      panel.hidden = true;
      var slots = options.slots || [];
      slots.forEach(function (slot) { slot.classList.remove('is-current'); });
      if (lastTrigger) {
        lastTrigger.style.visibility = '';
        lastTrigger.style.transform = '';
        lastTrigger.style.transition = '';
        lastTrigger.style.transformOrigin = '';
      }
      if (fromCase && options.onClose) options.onClose();
    }

    function close() {
      if (mode !== 'case') return;
      clearTimeout(closeTimer);
      cancelFlipAnim();
      flipping = false;
      if (!reduceMotion.matches) {
        var coverOpen = panel.classList.contains('is-flipped');
        flyToRail(lastTrigger, coverOpen);
        var total = (coverOpen ? Math.round(COVER_MS * 0.72) : 0) + CLOSE_MS + 70;
        closeTimer = setTimeout(function () { finishHome(true); }, total);
        return;
      }
      panel.classList.remove('is-open', 'is-flipped');
      finishHome(true);
    }

    function caseKey(project) {
      var title = (project && project.title) || '';
      if (/daughters/i.test(title)) return 'daughters';
      return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    function open(index, trigger) {
      var project = projects[index];
      if (!isLive(project)) return;

      clearTimeout(closeTimer);
      clearTimeout(openTimer);
      cancelFlipAnim();
      flipping = false;
      panel.classList.remove('is-flying', 'is-home', 'hide-folder');
      stage.classList.remove('is-home', 'is-returning');
      clearFlyStyles(nodes.shell);

      var slots = options.slots || [];
      var reopening = openIndex === index && mode === 'case';
      slots.forEach(function (slot) { slot.classList.remove('is-current'); });

      mode = 'case';
      openIndex = index;
      slides = slidesFor(project);
      slideIndex = 0;
      lastTrigger = folderFrom(trigger) || trigger || lastTrigger;

      if (nodes.title) nodes.title.textContent = project.title;
      panel.setAttribute('data-case', caseKey(project));

      paintFace(project);

      if (slots[index]) slots[index].classList.add('is-current');
      panel.hidden = false;
      stage.classList.add('is-detail');
      void panel.offsetHeight;

      paintSlideState(0);

      if (reduceMotion.matches) {
        panel.classList.add('is-open', 'is-flipped');
      } else if (!reopening) {
        flyFromRail(trigger);
      } else {
        panel.classList.add('is-open', 'is-flipped');
      }

      if (!reopening && nodes.title) nodes.title.focus({ preventScroll: true });
      if (options.onOpen) options.onOpen(index, slides.length);

      if (/[?&]hold=flip/i.test(location.search)) {
        var wait = reduceMotion.matches ? 40 : OPEN_MS + COVER_MS + 80;
        setTimeout(function () {
          if (mode === 'case') holdMidFlip();
        }, wait);
      }
    }

    function showHome(fromCase) {
      if (mode === 'case') {
        if (fromCase === false) {
          finishHome(false);
          return;
        }
        close();
        return;
      }
      finishHome(!!fromCase);
    }

    function clamp(n, min, max) {
      return n < min ? min : n > max ? max : n;
    }

    function leafAngle() {
      if (!nodes.leaf) return 0;
      var inline = (nodes.leaf.style.transform || '').match(/rotateY\((-?[\d.]+)deg\)/);
      if (inline) return parseFloat(inline[1]);
      var computed = getComputedStyle(nodes.leaf).transform;
      if (!computed || computed === 'none') return 0;
      /* rotateY matrix: matrix3d(cos, 0, -sin, 0,  0, 1, 0, 0,  sin, 0, cos, ...) */
      var m = computed.match(/matrix3d\(([^)]+)\)/);
      if (!m) return 0;
      var p = m[1].split(',').map(parseFloat);
      var rad = Math.atan2(p[8], p[0]);
      return rad * (180 / Math.PI);
    }

    function endDrag(commit) {
      if (!drag.tracking) return;
      var armed = drag.armed;
      drag.tracking = false;
      drag.armed = null;
      if (!armed || armed === 'maybe' || !nodes.leaf) {
        flipping = false;
        setTurning(false);
        return;
      }
      var current = leafAngle();
      var forward = armed === 'forward';
      var to = forward ? slideIndex + 1 : slideIndex - 1;
      if (!commit || to < 0 || to >= slides.length) {
        flipAnim = nodes.leaf.animate(
          [{ transform: 'rotateY(' + current.toFixed(2) + 'deg)' }, { transform: 'rotateY(' + (forward ? 0 : -180) + 'deg)' }],
          { duration: 280, easing: 'cubic-bezier(.22,.8,.18,1)', fill: 'forwards' }
        );
        flipAnim.onfinish = function () {
          flipping = false;
          setTurning(false);
          paintSlideState(slideIndex);
        };
        return;
      }
      var rest = forward ? -180 : 0;
      var remain = Math.abs(rest - current) / 180;
      flipAnim = nodes.leaf.animate(
        [{ transform: 'rotateY(' + current.toFixed(2) + 'deg)' }, { transform: 'rotateY(' + rest + 'deg)' }],
        { duration: Math.max(320, FLIP_MS * remain), easing: 'cubic-bezier(.22,.8,.18,1)', fill: 'forwards' }
      );
      function done() {
        if (!flipping) return;
        settleFlip(to);
      }
      flipAnim.onfinish = done;
      armFlipSettle(to);
    }

    function onPointerDown(event) {
      if (mode !== 'case' || flipping || reduceMotion.matches) return;
      if (event.button) return;
      if (!nodes.leaf || !event.target.closest('.book-leaf__face--front')) return;
      var rect = nodes.leaf.getBoundingClientRect();
      var rel = (event.clientX - rect.left) / Math.max(rect.width, 1);
      if (rel < 0.45) return;
      drag.tracking = true;
      drag.pointerId = event.pointerId;
      drag.startX = event.clientX;
      drag.armed = 'maybe';
      try { nodes.leaf.setPointerCapture(event.pointerId); } catch (err) {}
    }

    function onPointerMove(event) {
      if (!drag.tracking || !nodes.leaf) return;
      var dx = event.clientX - drag.startX;
      if (drag.armed === 'maybe') {
        if (Math.abs(dx) < 12) return;
        drag.armed = dx < 0 ? 'forward' : 'back';
        if (drag.armed === 'forward' && slideIndex >= slides.length - 1) {
          drag.armed = 'maybe';
          return;
        }
        if (drag.armed === 'back' && slideIndex <= 0) {
          drag.armed = 'maybe';
          return;
        }
        flipping = true;
        setTurning(true);
        nodes.book.classList.add('is-instant');
        if (drag.armed === 'back') {
          var prev = slideIndex - 1;
          fillText(nodes.leftPage, slides[prev], prev);
          fillMedia(nodes.frontPage, slides[prev]);
          fillText(nodes.backPage, slides[slideIndex], slideIndex);
          fillMedia(nodes.underPage, slides[slideIndex] || {});
          nodes.leaf.style.transform = 'rotateY(-180deg)';
        }
        void nodes.leaf.offsetWidth;
        nodes.book.classList.remove('is-instant');
      }
      if (drag.armed !== 'forward' && drag.armed !== 'back') return;
      var pageW = nodes.leaf.getBoundingClientRect().width || 320;
      var progress = drag.armed === 'forward'
        ? clamp(-dx / pageW, 0, 1)
        : clamp(dx / pageW, 0, 1);
      var deg = drag.armed === 'forward' ? progress * -180 : -180 + progress * 180;
      nodes.leaf.style.transform = 'rotateY(' + deg.toFixed(2) + 'deg)';
    }

    function onPointerUp(event) {
      if (!drag.tracking) return;
      var dx = event.clientX - drag.startX;
      var pageW = (nodes.leaf && nodes.leaf.getBoundingClientRect().width) || 320;
      var progress = drag.armed === 'forward'
        ? clamp(-dx / pageW, 0, 1)
        : clamp(dx / pageW, 0, 1);
      var commit = progress > 0.28 || Math.abs(dx) > 72;
      if (drag.armed === 'maybe') {
        drag.tracking = false;
        flipping = false;
        return;
      }
      endDrag(commit);
    }

    if (nodes.leaf) {
      nodes.leaf.addEventListener('pointerdown', onPointerDown);
      nodes.leaf.addEventListener('pointermove', onPointerMove);
      nodes.leaf.addEventListener('pointerup', onPointerUp);
      nodes.leaf.addEventListener('pointercancel', function () { if (drag.tracking) endDrag(false); });
    }

    document.addEventListener('keydown', function (event) {
      if (mode !== 'case') return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        stepSlide(1);
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        stepSlide(-1);
      }
    });

    return {
      open: open,
      close: close,
      showHome: showHome,
      stepSlide: stepSlide,
      goToSlide: goToSlide,
      holdMidFlip: holdMidFlip,
      isOpen: function () { return mode === 'case'; },
      isHome: function () { return mode === 'off'; },
      openIndex: function () { return openIndex; },
      slideIndex: function () { return slideIndex; },
      slideCount: function () { return slides.length; },
      atFirstSlide: function () { return slideIndex <= 0; },
      atLastSlide: function () { return slideIndex >= slides.length - 1; }
    };
  }

  return { create: create };
})();
