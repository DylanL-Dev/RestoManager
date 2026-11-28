/* RestoManager · écran de démarrage 2027 (v1)
   À charger SANS defer, juste après <div id="integrationLoading">.
   - ajoute le logo dessiné, la barre de progression et le message « connexion lente » ;
   - quand l'app retire l'écran (v3-connected-auth.js : .remove()), pose une copie qui s'efface
     en s'ouvrant depuis le centre, puis la supprime.
   Ne change ni le texte de statut, ni le moment où l'app retire l'écran. Aucune donnée lue. */
(() => {
  const el = document.getElementById('integrationLoading');
  if (!el || el.dataset.rmBoot) return;
  el.dataset.rmBoot = '1';
  const NS = 'http://www.w3.org/2000/svg';

  const mark = document.createElement('div');
  mark.className = 'rm-boot-mark';
  mark.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  for (const [d, len] of [['M6 13.87A4 4 0 0 1 6.38 6a6 6 0 0 1 11.24 0A4 4 0 0 1 18 13.87V21H6Z', 62], ['M6 17h12', 12]]) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.style.setProperty('--len', len);
    svg.append(p);
  }
  mark.append(svg);
  el.prepend(mark);

  const bar = document.createElement('div');
  bar.className = 'rm-boot-bar';
  bar.setAttribute('aria-hidden', 'true');
  const slow = document.createElement('p');
  slow.className = 'rm-boot-slow';
  slow.textContent = 'La connexion prend plus de temps que prévu…';
  const status = el.querySelector('p');
  (status || el.querySelector('strong') || mark).after(bar, slow);

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mo = new MutationObserver(() => {
    if (el.isConnected) return;
    mo.disconnect();
    const ghost = el.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.removeAttribute('role');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.querySelector('.rm-boot-slow')?.remove();
    ghost.className = 'rm-boot-exit';
    document.body.append(ghost);
    const done = () => ghost.remove();
    ghost.addEventListener('animationend', e => { if (e.target === ghost) done(); });
    setTimeout(done, reduce ? 400 : 1000);
  });
  mo.observe(el.parentNode || document.body, { childList: true });
})();
