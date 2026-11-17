// RM-016: authenticated, role-aware learning. Real-screen guides are read-only;
// all practice happens in an opaque-origin iframe with no network permission.
export function installTutorial({user, profile, management}) {
  const model = window.RestoLearning;
  if (!model || !user?.id || !profile?.active || !['reception', 'fb_admin'].includes(profile.role) || !management || document.getElementById('restoTourHelp')) return;
  const role = profile.role === 'reception' ? 'reception' : 'restaurant';
  const storageKey = model.scope({userId: user.id, restaurantId: profile.restaurant_id, role});
  if (!storageKey) return;
  const $ = selector => document.querySelector(selector);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const icon = name => { const n = el('i'); n.dataset.lucide = name; n.setAttribute('aria-hidden', 'true'); return n; };
  const icons = () => window.lucide?.createIcons?.();
  const button = (label, fn, cls = 'rmLearnSecondary', glyph) => { const b = el('button', cls); b.type = 'button'; if (glyph) b.append(icon(glyph)); b.append(document.createTextNode(label)); b.addEventListener('click', () => void fn()); return b; };
  let settings = {level: 'beginner', progress: {}, practice: {}}, memoryOnly = false, detached = false;
  try { const saved = JSON.parse(localStorage.getItem(storageKey) || 'null'); if (saved && typeof saved === 'object' && !Array.isArray(saved)) settings = {level: saved.level === 'quick' ? 'quick' : 'beginner', progress: saved.progress && typeof saved.progress === 'object' && !Array.isArray(saved.progress) ? saved.progress : {}, practice: saved.practice && typeof saved.practice === 'object' ? saved.practice : {}}; } catch { memoryOnly = true; }
  const validIdentity = () => !detached && window.RestoNotificationContext?.userId === user.id && window.RestoNotificationContext?.restaurantId === profile.restaurant_id && window.RestoNotificationContext?.role === profile.role;
  const features = () => ({closeout: window.RestoServiceCapabilities?.service_regularization === 1, 'online-booking': false});
  const courses = () => model.available(role, features());
  function save() { if (!validIdentity()) return; try { localStorage.setItem(storageKey, JSON.stringify(settings)); memoryOnly = false; } catch { memoryOnly = true; } }
  function progress(course) { return model.readProgress(settings.progress[model.progressKey(course, settings.level)], course, settings.level); }
  function record(complete = false) { if (!session?.ready || !validIdentity()) return; const key = model.progressKey(session.course, session.level); const old = settings.progress[key]; settings.progress[key] = {index: session.index, complete: complete || old?.complete === true}; save(); }
  const center = el('dialog', 'rmLearningCenter'); center.id = 'rmLearningCenter'; center.setAttribute('aria-labelledby', 'rmLearningTitle');
  const head = el('header', 'rmLearnHeader'), heading = el('div'); heading.append(el('p', 'rmLearnEyebrow', 'À VOTRE RYTHME'));
  const title = el('h1', '', 'Apprendre RestoManager'); title.id = 'rmLearningTitle'; title.tabIndex = -1; heading.append(title);
  const closeCenterButton = button('', () => closeCenter(), 'rmLearnIconButton', 'x'); closeCenterButton.setAttribute('aria-label', 'Fermer l’aide');
  head.append(heading, closeCenterButton);
  const content = el('div', 'rmLearnContent'), centerStatus = el('p', 'rmLearnStatus'); centerStatus.setAttribute('role', 'status'); centerStatus.setAttribute('aria-live', 'polite');
  center.append(head, centerStatus, content); document.body.append(center);
  let returnFocus = null, previousOverflow = '', session = null, coach = null, target = null, operation = 0, changing = false, currentContext = null, trainingFrame = null, trainingToken = null;
  const protectedForms = new Map();
  const helpButton = button('', () => openCenter(), 'rmLearningHelp', 'circle-help'); helpButton.id = 'rmLearningHelp'; helpButton.title = 'Aide et entraînement'; helpButton.setAttribute('aria-label', 'Aide et entraînement'); helpButton.setAttribute('aria-haspopup', 'dialog'); helpButton.append(el('span', '', 'Aide'));
  $('.headerQuickActions')?.prepend(helpButton);
  const help = el('details', 'managementGroup restoTourHelp'); help.id = 'restoTourHelp';
  const summary = el('summary', 'managementGroupHead'), badge = el('span', 'managementGroupIcon'); badge.setAttribute('aria-hidden', 'true'); badge.append(icon('notebook-pen'));
  const words = el('span', 'managementGroupWords'); words.append(el('strong', '', 'Didacticiel & aide'), el('small', '', 'Apprendre, s’entraîner et trouver une réponse'));
  const arrow = el('span', 'managementChevron'); arrow.setAttribute('aria-hidden', 'true'); arrow.append(icon('chevron-down')); summary.append(badge, words, arrow);
  const helpBody = el('div', 'managementGroupBody'); helpBody.append(el('p', 'muted', 'Un guide dans vos écrans, une réponse à votre question ou un exercice sans risque. Choisissez ce qui vous aide aujourd’hui.'), button('Ouvrir l’aide et l’entraînement', () => openCenter(), 'rmLearnPrimary', 'notebook-pen'));
  help.append(summary, helpBody); management.append(help); icons();

  function status(message) { centerStatus.textContent = message || (memoryOnly ? 'Votre progression est conservée pour cette visite seulement : l’enregistrement sur cet appareil est indisponible.' : navigator.onLine === false ? 'L’aide reste consultable hors connexion. Les données du service peuvent être anciennes.' : ''); }
  function releaseFrame() { trainingFrame?.remove(); trainingFrame = null; trainingToken = null; }
  function closeCenter({restore = true} = {}) { releaseFrame(); if (center.open) center.close(); document.body.style.overflow = previousOverflow; helpButton.setAttribute('aria-expanded', 'false'); if (restore) (returnFocus?.isConnected && visible(returnFocus) ? returnFocus : helpButton).focus({preventScroll: true}); }
  function openCenter(options = {}) {
    if (!validIdentity()) return false;
    const origin = session ? helpButton : document.activeElement;
    hideWelcome(); closeGuide({restore: false}); window.RestoNotifications?.close?.();
    currentContext = window.RestoScreens?.current?.() || 'tables';
    if (!center.open) { returnFocus = origin; previousOverflow = document.body.style.overflow; center.showModal(); document.body.style.overflow = 'hidden'; }
    helpButton.setAttribute('aria-expanded', 'true'); renderCenter(options); title.focus({preventScroll: true}); return true;
  }
  function sectionTitle(text) { return el('h2', 'rmLearnSectionTitle', text); }
  function courseCard(course) {
    const p = progress(course), card = el('article', 'rmLearnCourse'); card.dataset.learningCourse = course.id;
    const symbol = el('span', 'rmLearnCourseIcon'); symbol.append(icon(p.complete ? 'check-circle-2' : course.icon));
    const text = el('div', 'rmLearnCourseWords'); text.append(el('h3', '', course.title), el('p', '', course.description));
    const started = settings.progress[model.progressKey(course, settings.level)];
    text.append(el('small', '', p.complete ? 'Parcours terminé · à revoir quand vous voulez' : started ? 'À reprendre · étape ' + (p.index + 1) + '/' + p.total : p.total + ' étapes · environ ' + course.minutes + ' min'));
    const start = button(p.complete ? 'Revoir' : started ? 'Reprendre' : 'Découvrir', () => startCourse(course.id), 'rmLearnCourseStart'); start.setAttribute('aria-label', (p.complete ? 'Revoir ' : started ? 'Reprendre ' : 'Découvrir ') + course.title);
    card.append(symbol, text, start); return card;
  }
  function renderCenter({topic} = {}) {
    releaseFrame(); content.replaceChildren(); title.textContent = 'Apprendre RestoManager'; status();
    const welcome = el('p', 'rmLearnLead', 'Une chose à la fois. Vous pouvez arrêter, reprendre ou recommencer quand vous le souhaitez.');
    const levels = el('div', 'rmLearnLevels'); levels.setAttribute('role', 'group'); levels.setAttribute('aria-label', 'Votre accompagnement');
    for (const [id, label, hint, glyph] of [['beginner', 'Je découvre RestoManager', 'Des gestes simples, expliqués pas à pas.', 'user-round'], ['quick', 'Je connais déjà les bases', 'Les repères essentiels, plus rapidement.', 'zap']]) {
      const b = button('', () => { settings.level = id; save(); renderCenter(); content.querySelector('[aria-pressed="true"]')?.focus(); }, 'rmLearnLevel'); b.dataset.learningLevel = id; b.setAttribute('aria-pressed', String(settings.level === id));
      const words = el('span'); words.append(el('strong', '', label), el('small', '', hint)); b.append(icon(glyph), words); levels.append(b);
    }
    content.append(welcome, levels);
    if (topic && courses().some(c => c.id === topic)) {
      const focused = el('section', 'rmLearnSuggested'); focused.append(sectionTitle('L’explication qui vous intéresse'), courseCard(courses().find(c => c.id === topic))); content.append(focused);
    }
    const intro = courses().find(c => c.id === 'first-steps');
    const discovering = settings.level === 'beginner' && !progress(intro).complete;
    const contextSection = el('section', 'rmLearnSuggested'); contextSection.append(sectionTitle(discovering ? 'Pour commencer' : 'Pour cet écran'));
    const relevant = courses().filter(c => c.screens.includes(currentContext) && c.id !== intro.id);
    const suggested = discovering ? [intro, ...relevant.slice(0, 1)] : courses().filter(c => c.screens.includes(currentContext)).slice(0, 2);
    if (!suggested.length) suggested.push(intro);
    for (const c of suggested) contextSection.append(courseCard(c)); content.append(contextSection);
    const practice = el('section', 'rmLearnPractice'); const practiceWords = el('div'); practiceWords.append(el('span', 'rmLearnEyebrow', 'ESSAYER SANS RISQUE'), el('h2', '', 'Un exercice, aucun vrai client'), el('p', '', role === 'restaurant' ? 'Retrouvez la chambre 204, installez le client fictif puis libérez sa table.' : 'Retrouvez la chambre 204 et confirmez sa réservation fictive.'));
    practice.append(practiceWords, button('M’entraîner', () => showPractice('welcome'), 'rmLearnPrimary', 'arrow-up-right')); content.append(practice);
    const questions = el('section', 'rmLearnQuestions'); questions.append(sectionTitle('Une question ?'));
    const searchLabel = el('label', 'rmLearnSearchLabel', 'Chercher une explication'); const search = el('input'); search.type = 'search'; search.id = 'rmLearningSearch'; search.placeholder = 'Ex. : retard, statut, connexion…'; searchLabel.append(search);
    const answers = el('div'); answers.id = 'rmLearningAnswers';
    function showAnswers() {
      answers.replaceChildren(); const matches = model.search(model.faq.filter(f => f.roles.includes(role)), search.value);
      if (!matches.length) answers.append(el('p', 'rmLearnEmpty', 'Aucune réponse trouvée. Essayez un autre mot ou consultez Assistance dans Gestion.'));
      for (const answer of matches) {
        const box = el('details', 'rmLearnAnswer'), s = el('summary', '', answer.title); box.append(s, el('p', '', answer.text));
        const id = answer.guide === 'support' ? role === 'restaurant' ? 'management' : 'reception-help' : answer.guide;
        if (courses().some(c => c.id === id)) box.append(button('Me montrer', () => startCourse(id), 'rmLearnTextButton'));
        answers.append(box);
      }
      const live = el('p', 'rmLearnSr', matches.length + ' explication(s) trouvée(s)'); live.setAttribute('role', 'status'); answers.append(live);
    }
    search.addEventListener('input', showAnswers); questions.append(searchLabel, answers); showAnswers(); content.append(questions);
    const all = el('details', 'rmLearnAll'); all.append(el('summary', '', 'Tous les petits parcours · ' + (role === 'restaurant' ? 'Restaurant' : 'Réception')));
    for (const c of courses()) all.append(courseCard(c)); content.append(all);
    const morePractice = el('details', 'rmLearnAll'); morePractice.append(el('summary', '', 'Autres exercices sans risque'), button('Créer une réservation fictive', () => showPractice('booking'), 'rmLearnSecondary'), button('Comprendre une notification fictive', () => showPractice('notifications'), 'rmLearnSecondary')); content.append(morePractice);
    const lexicon = el('details', 'rmLearnAll'), definitions = el('dl', 'rmLearnLexicon'); lexicon.append(el('summary', '', 'Les mots du restaurant'));
    for (const [word, meaning] of model.lexicon) definitions.append(el('dt', '', word), el('dd', '', meaning)); lexicon.append(definitions); content.append(lexicon);
    const news = button('Quoi de neuf dans RestoManager ?', () => { closeCenter({restore: false}); window.RestoNotifications?.showHistory?.(); }, 'rmLearnTextButton', 'sparkles'); content.append(news); center.scrollTop = 0; icons();
  }
  function showPractice(scenario) {
    if (!validIdentity() || !window.RestoLearningTraining) return;
    releaseFrame(); content.replaceChildren(); title.textContent = 'S’entraîner sans risque'; status('Aucune action dans cet exercice ne modifie le service réel.');
    const back = button('Retour à l’aide', () => { renderCenter(); title.focus({preventScroll: true}); }, 'rmLearnSecondary', 'arrow-left');
    const frame = el('iframe', 'rmLearnTraining'); frame.id = 'rmLearningTraining'; frame.title = 'Entraînement fictif ' + (role === 'restaurant' ? 'Restaurant' : 'Réception'); frame.setAttribute('sandbox', 'allow-scripts'); frame.setAttribute('referrerpolicy', 'no-referrer');
    trainingToken = crypto.randomUUID(); trainingFrame = frame;
    frame.srcdoc = window.RestoLearningTraining.documentFor({role, scenario, token: trainingToken, dark: document.documentElement.dataset.theme === 'dark'});
    content.append(back, frame); back.focus({preventScroll: true});
  }
  window.addEventListener('message', event => {
    if (!validIdentity() || !trainingFrame || event.source !== trainingFrame.contentWindow || event.data?.type !== 'rm016:practice-complete' || event.data.token !== trainingToken || !['welcome', 'booking', 'notifications'].includes(event.data.scenario)) return;
    settings.practice[event.data.scenario] = true; save(); status('Exercice réussi. Rien n’a été modifié dans le service réel. Vous pouvez recommencer.');
  });

  function visible(n) { return !!n?.isConnected && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden' && !n.closest('[hidden]'); }
  function findTarget(step) { return step.target.flatMap(selector => [...document.querySelectorAll(selector)]).find(visible) || null; }
  function clearTarget() { if (!target) return; target.classList.remove('rmLearnTarget'); const ids = (target.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== 'rmGuideDescription'); if (ids.length) target.setAttribute('aria-describedby', ids.join(' ')); else target.removeAttribute('aria-describedby'); target = null; }
  function closeGuide({restore = true} = {}) {
    operation++; record(); clearTarget(); for (const [form, inert] of protectedForms) form.inert = inert; protectedForms.clear(); const source = session?.source; session = null; coach?.remove(); coach = null; changing = false;
    if (restore) (source?.isConnected && visible(source) ? source : helpButton).focus({preventScroll: true});
  }
  function makeCoach() {
    const panel = el('section', 'rmLearnCoach'); panel.id = 'rmLearningCoach'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false'); panel.setAttribute('aria-labelledby', 'rmGuideCount rmGuideTitle'); panel.setAttribute('aria-describedby', 'rmGuideDescription rmGuideResult'); panel.tabIndex = -1;
    const top = el('div', 'rmLearnCoachTop'), count = el('span', 'rmLearnEyebrow'); count.id = 'rmGuideCount';
    const quit = button('', () => closeGuide(), 'rmLearnIconButton', 'x'); quit.setAttribute('aria-label', 'Quitter le guide'); top.append(count, quit);
    const h = el('h2'); h.id = 'rmGuideTitle'; const description = el('p'); description.id = 'rmGuideDescription';
    const result = el('p', 'rmLearnResult'); result.id = 'rmGuideResult';
    const message = el('p', 'rmLearnStatus'); message.id = 'rmGuideStatus'; message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
    const extra = el('details', 'rmLearnCoachExtra'), extraTitle = el('summary', '', 'Je n’ai pas compris'), extraText = el('p'); extra.addEventListener('toggle', positionCoach); extra.append(extraTitle, extraText, button('Recommencer ce parcours', () => { if (!session) return; const id = session.course.id; delete settings.progress[model.progressKey(session.course, session.level)]; session.ready = false; save(); void startCourse(id, {restart: true}); }, 'rmLearnTextButton'));
    const foot = el('div', 'rmLearnCoachFooter');
    const prev = button('Précédent', () => move(-1)), next = button('Continuer', () => move(1), 'rmLearnPrimary'); prev.id = 'rmGuidePrev'; next.id = 'rmGuideNext'; foot.append(prev, next);
    const focus = button('Aller au repère', () => target?.focus?.({preventScroll: true}), 'rmLearnTextButton'); focus.id = 'rmGuideFocus';
    const practice = button('Essayer sans risque', () => { const scenario = session?.course.id === 'notifications' ? 'notifications' : session?.course.id === 'new-booking' ? 'booking' : 'welcome'; openCenter(); showPractice(scenario); }, 'rmLearnTextButton');
    const help = button('Toute l’aide', () => openCenter(), 'rmLearnTextButton');
    const links = el('div', 'rmLearnCoachLinks'); links.append(focus, practice, help);
    const reading = el('div', 'rmLearnCoachReading'); reading.append(h, description, result, message, extra);
    panel.append(top, reading, foot, links); panel._refs = {count, h, description, result, message, extra, extraText, prev, next, focus}; document.body.append(panel); return panel;
  }
  function positionCoach() {
    if (!coach) return;
    const b = target && visible(target) ? target.getBoundingClientRect() : {left: 12, top: 70, right: 12, bottom: 70};
    const v = window.visualViewport, viewportWidth = v?.width || innerWidth, viewportHeight = v?.height || innerHeight;
    const parent = coach.parentElement?.tagName === 'DIALOG' ? coach.parentElement.getBoundingClientRect() : null;
    const leftEdge = Math.max((v?.offsetLeft || 0) + 12, parent ? parent.left + 12 : 0);
    const rightEdge = Math.min((v?.offsetLeft || 0) + viewportWidth - 12, parent ? parent.right - 12 : Infinity);
    const topEdge = Math.max((v?.offsetTop || 0) + 70, parent ? parent.top + 12 : 0);
    const bottomEdge = Math.min((v?.offsetTop || 0) + viewportHeight - (innerWidth < 768 ? 85 : 14), parent ? parent.bottom - 12 : Infinity);
    const width = Math.min(350, rightEdge - leftEdge), maxHeight = Math.max(150, bottomEdge - topEdge);
    coach.style.width = width + 'px'; coach.style.maxHeight = maxHeight + 'px';
    let h = Math.min(coach.scrollHeight + 2, maxHeight); const gap = 14;
    const candidates = [
      {left: b.right + gap, top: Math.max(topEdge, Math.min(b.top, bottomEdge - h))},
      {left: b.left - width - gap, top: Math.max(topEdge, Math.min(b.top, bottomEdge - h))},
      {left: Math.max(leftEdge, Math.min(b.left, rightEdge - width)), top: b.bottom + gap},
      {left: Math.max(leftEdge, Math.min(b.left, rightEdge - width)), top: b.top - h - gap}
    ];
    let chosen = candidates.find(p => p.left >= leftEdge && p.left + width <= rightEdge + 1 && p.top >= topEdge && p.top + h <= bottomEdge + 1);
    if (!chosen && target && visible(target)) {
      const above = b.top - gap - topEdge, below = bottomEdge - b.bottom - gap, room = Math.max(above, below);
      if (room >= 160) {
        const limit = Math.min(maxHeight, Math.floor(room)); coach.style.maxHeight = limit + 'px'; h = Math.min(coach.scrollHeight + 2, limit);
        chosen = {left: Math.max(leftEdge, Math.min(b.left, rightEdge - width)), top: above >= below ? b.top - h - gap : b.bottom + gap};
      }
    }
    chosen ||= {left: rightEdge - width, top: Math.max(topEdge, bottomEdge - h)};
    const availableHeight = target && chosen.top + h <= b.top - gap + 1 ? b.top - gap - chosen.top : bottomEdge - chosen.top;
    coach.style.maxHeight = Math.max(150, Math.min(parseFloat(coach.style.maxHeight), Math.floor(availableHeight))) + 'px';
    coach.style.left = chosen.left + 'px'; coach.style.top = chosen.top + 'px';
  }
  function refreshHighlight() {
    if (!session?.ready || changing || !coach) return;
    const step = session.steps[session.index];
    const next = findTarget(step) || (step.fallback ? [...document.querySelectorAll(step.fallback)].find(visible) : null);
    if (next !== target) {
      clearTarget(); target = next;
      if (target) { target.classList.add('rmLearnTarget'); const ids = new Set((target.getAttribute('aria-describedby') || '').split(' ').filter(Boolean)); ids.add('rmGuideDescription'); target.setAttribute('aria-describedby', [...ids].join(' ')); }
      else { coach._refs.message.textContent = 'Ce repère n’est plus affiché. Vous pouvez continuer les explications.'; coach._refs.next.disabled = false; }
    }
    positionCoach();
  }
  async function present(index) {
    if (!session || changing || !validIdentity()) return false;
    const mine = ++operation, current = session, step = current.steps[index]; changing = true; current.ready = false; clearTarget();
    try {
      // Close the help dialog before invoking the existing unsaved-input guard.
      if (step.screen && window.RestoScreens?.current?.() !== step.screen) {
        if (!await window.RestoScreens?.request?.(step.screen)) {
          if (mine !== operation || session !== current) return false;
          showBlocked(); return false;
        }
      }
      if (mine !== operation || session !== current || !validIdentity()) return false;
      if (step.view === 'notifications') {
        window.RestoNotifications?.open?.(); $('#serviceReminderPanel')?.append(coach);
      } else {
        document.body.append(coach); window.RestoNotifications?.close?.();
      }
      if (step.category) window.RestoManagementCategories?.open(step.category);
      if (step.screen === 'reservationForm') { const section = $('#reservationForm'); if (section?.tagName === 'DETAILS') section.open = true; }
      if (step.screen === 'passages' && role === 'restaurant') { const section = $('#passages'); if (section?.tagName === 'DETAILS') section.open = true; }
      // Let RM-013 register dynamically authenticated accordion headings.
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (mine !== operation || session !== current) return false;
      current.index = index; current.ready = true;
      let n = findTarget(step); const missing = !n;
      if (!n && step.fallback) n = [...document.querySelectorAll(step.fallback)].find(visible);
      target = n;
      const r = coach._refs, total = current.steps.length;
      r.count.textContent = 'Guide en lecture · ' + (index + 1) + '/' + total;
      r.h.textContent = step.title;
      const verb = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches ? 'Touchez' : 'Cliquez sur';
      r.description.textContent = step.navigate ? verb + ' le bouton mis en évidence pour continuer.' : step.open ? verb + ' la cloche pour continuer.' : step.text;
      r.result.textContent = step.result;
      r.message.textContent = missing ? step.absent || 'Ce repère n’est pas disponible dans cet écran actuellement. Vous pouvez continuer les explications ou essayer l’exercice fictif.' : '';
      r.extraText.textContent = [step.text, current.level === 'beginner' && model.basics[step.basics], step.detail].filter(Boolean).join(' '); r.extra.open = false; coach.querySelector('.rmLearnCoachReading').scrollTop = 0;
      r.prev.disabled = index === 0; r.next.disabled = !missing && !!(step.navigate || step.open); r.next.textContent = index === total - 1 ? 'Terminer le parcours' : 'Continuer';
      r.focus.hidden = !n || !!n.closest('form[inert]'); r.focus.disabled = r.focus.hidden;
      if (n) { n.classList.add('rmLearnTarget'); const ids = new Set((n.getAttribute('aria-describedby') || '').split(' ').filter(Boolean)); ids.add('rmGuideDescription'); n.setAttribute('aria-describedby', [...ids].join(' ')); n.scrollIntoView({block: 'center', behavior: 'instant'}); }
      coach.hidden = false; positionCoach(); record(); icons(); coach.focus({preventScroll: true}); return true;
    } finally { if (mine === operation) changing = false; }
  }
  function showBlocked() {
    if (!coach || !session) return;
    coach.hidden = false; coach._refs.h.textContent = 'Votre saisie est conservée'; coach._refs.description.textContent = 'Terminez votre saisie avant de poursuivre ce parcours, ou restez dans l’aide pour lire une explication.'; coach._refs.result.textContent = 'Le guide n’a pas quitté votre écran.'; coach._refs.message.textContent = 'Vous pourrez reprendre ce parcours après votre enregistrement.'; coach._refs.extra.hidden = true; coach._refs.prev.disabled = true; coach._refs.next.disabled = false; coach._refs.next.textContent = 'Réessayer'; coach._refs.focus.hidden = true; coach.style.width = 'min(350px, calc(100vw - 24px))'; coach.style.left = '12px'; coach.style.top = '80px'; coach.focus({preventScroll: true});
  }
  async function startCourse(id, {restart = false} = {}) {
    if (!validIdentity()) return false;
    const course = courses().find(c => c.id === id); if (!course) return false;
    if (window.RestoBookingDraft?.checking?.() || window.RestoEditNavigation?.isBusy?.() || window.RestoCloseout?.isBusy?.()) { openCenter(); status('Un enregistrement est en cours. Attendez sa confirmation avant de commencer un guide.'); return false; }
    hideWelcome(); const source = center.open ? helpButton : document.activeElement; closeCenter({restore: false}); closeGuide({restore: false});
    const steps = model.stepsFor(course, settings.level), state = progress(course);
    if (restart || state.complete) { settings.progress[model.progressKey(course, settings.level)] = {index: 0, complete: false}; save(); }
    for (const form of document.querySelectorAll('form')) { protectedForms.set(form, form.inert); form.inert = true; }
    session = {course, steps, level: settings.level, index: restart || state.complete ? 0 : state.index, ready: false, source}; coach = makeCoach(); coach.hidden = true;
    return present(session.index);
  }
  async function move(delta) {
    if (!session || changing) return;
    if (!session.ready) { coach._refs.extra.hidden = false; await present(session.index); return; }
    if (delta > 0 && session.index === session.steps.length - 1) {
      record(true); const name = session.course.title; closeGuide({restore: false}); openCenter(); status('Parcours « ' + name + ' » terminé. Vous pouvez le revoir ou passer à un exercice.'); return;
    }
    await present(Math.max(0, Math.min(session.steps.length - 1, session.index + delta)));
  }
  // Guided reading must never submit forms or operate real business controls.
  // Navigation uses the existing draft guard; practice is strictly in the iframe.
  function protect(event) {
    if (!session || !validIdentity() || event.target.closest?.('#rmLearningCoach, #rmLearningCenter, #restoTourWelcome')) return;
    if (event.target.closest?.('#rmLearningHelp')) return;
    // The existing unsaved-input confirmation must remain operable while navigation waits.
    if (changing && event.target.closest?.('.rmNoticeOverlay [role="alertdialog"]')) return;
    const step = session.steps[session.index];
    if (event.type === 'input' || event.type === 'change') { if (!['reservationQuery', 'reservationDate', 'quickReleaseSearch'].includes(event.target.id)) event.stopImmediatePropagation(); return; }
    if (event.type === 'click' && session.ready && target?.contains(event.target) && (step.navigate || step.open)) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (changing) return;
      if (step.navigate) {
        const current = session; changing = true;
        void window.RestoScreens?.request?.(step.navigate).then(allowed => { changing = false; if (session !== current) return; if (allowed) void present(session.index + 1); else coach._refs.message.textContent = 'Votre saisie est conservée. Terminez-la avant de changer d’écran.'; });
      } else { window.RestoNotifications?.open?.(); void present(session.index + 1); }
      return;
    }
    if (event.type === 'click' && event.target.closest?.('.mobileNavItem, .sidebar a[href^="#"], #navBackBtn')) { closeGuide({restore: false}); return; }
    if (event.type === 'click' && event.target.closest?.('#reservationQuery, #reservationDate, #reservationShowAll, #quickReleaseSearch')) return;
    if (event.type === 'click' && !event.target.closest?.('button, a, input, select, textarea, label, summary')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    coach._refs.message.textContent = 'Ce guide reste en lecture pour protéger le service. Utilisez « Essayer sans risque » pour pratiquer.';
  }
  window.addEventListener('click', protect, true); window.addEventListener('submit', protect, true);
  window.addEventListener('input', protect, true); window.addEventListener('change', protect, true);
  document.addEventListener('beforeinput', event => { if (session && !event.target.closest?.('#rmLearningCoach, #rmLearningCenter, #reservationQuery, #quickReleaseSearch')) { event.preventDefault(); } }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && session) { event.preventDefault(); closeGuide(); } });
  center.addEventListener('cancel', event => { event.preventDefault(); closeCenter(); });
  center.addEventListener('close', () => { if (!center.open) { releaseFrame(); document.body.style.overflow = previousOverflow; } });
  center.addEventListener('keydown', event => { if (event.key !== 'Tab') return; const nodes = [...center.querySelectorAll('button, input, summary, iframe, [href]')].filter(visible); const first = nodes[0], last = nodes.at(-1); if (event.shiftKey && (document.activeElement === first || document.activeElement === title)) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } });
  window.addEventListener('resize', refreshHighlight, {passive: true});
  window.addEventListener('scroll', positionCoach, {passive: true});
  window.addEventListener('restomanager:supabase-snapshot', () => requestAnimationFrame(refreshHighlight));
  window.visualViewport?.addEventListener('resize', positionCoach);
  window.addEventListener('restomanager:screen', () => { if (session && !changing && session.ready) { const step = session.steps[session.index]; if (step.screen && step.screen !== window.RestoScreens?.current?.()) closeGuide({restore: false}); } });
  window.addEventListener('restomanager:notification-context', () => { if (!validIdentity()) { closeGuide({restore: false}); closeCenter({restore: false}); detached = true; helpButton.remove(); help.remove(); } });
  window.addEventListener('storage', event => { if (event.key !== storageKey || session || center.open) return; try { const value = JSON.parse(event.newValue || 'null'); if (value?.progress && typeof value.progress === 'object') settings.progress = value.progress; } catch {} });
  const inviteKey = storageKey + ':invitation';
  function hideWelcome() { $('#restoTourWelcome')?.remove(); try { localStorage.setItem(inviteKey, '1'); } catch {} }
  function welcome() {
    let seen = false; try { seen = localStorage.getItem(inviteKey) === '1' || localStorage.getItem('restomanager_tutorial_seen_v1_' + user.id) === '1'; } catch {}
    if (seen) return;
    const prompt = el('aside', 'restoTourWelcome'); prompt.id = 'restoTourWelcome'; prompt.setAttribute('aria-label', 'Découvrir RestoManager');
    const x = button('', hideWelcome, 'restoTourWelcomeClose rmLearnIconButton', 'x'); x.setAttribute('aria-label', 'Fermer cette suggestion');
    const row = el('div', 'rmLearnCoachTop'); row.append(el('strong', '', 'Un coup de main pour commencer ?'), x);
    const actions = el('div', 'rmLearnCoachFooter'); actions.append(button('Plus tard', hideWelcome, 'restoTourLater rmLearnSecondary'), button('Découvrir l’aide', () => openCenter(), 'rmLearnPrimary'));
    prompt.append(row, el('p', '', 'Des explications simples et des exercices sans toucher au service.'), actions); document.body.append(prompt); icons();
  }
  window.RestoTutorial = {
    isReading: () => Boolean(session && validIdentity()),
    open: openCenter, start: () => startCourse('first-steps'), startCourse,
    restart: id => startCourse(id, {restart: true}),
    guideForRelease: version => /rm016/.test(version) ? 'first-steps' : /rm014/.test(version) ? 'notifications' : /rm012/.test(version) && courses().some(c => c.id === 'closeout') ? 'closeout' : null,
    checkTargets: () => courses().flatMap(c => c.steps.map(s => ({guide: c.id, step: s.id, screen: s.screen, target: s.target, exists: s.target.some(selector => document.querySelector(selector)), dynamic: !!s.fallback || !!s.category || s.target.some(t => t.startsWith('.rmNc'))})))
  };
  welcome();
}
