(() => {
  const $ = (s) => document.querySelector(s);
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }
  };

  // Age gate
  const gate = $('#gate');
  if (store.get('kl-21') === 'yes') gate.classList.add('hide');
  else document.body.style.overflow = 'hidden';
  $('#gate-yes').addEventListener('click', () => {
    store.set('kl-21', 'yes');
    gate.classList.add('hide');
    document.body.style.overflow = '';
  });

  // Nav: solid on scroll, mobile menu
  const nav = $('#nav'), burger = $('#burger'), menu = $('#menu');
  const onScroll = () => nav.classList.toggle('solid', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  burger.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    burger.setAttribute('aria-expanded', open);
  });
  menu.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') { menu.classList.remove('open'); burger.setAttribute('aria-expanded', false); }
  });

  // Scroll reveal
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: 0.15 });
  document.querySelectorAll('.reveal').forEach((el, i) => {
    el.style.transitionDelay = `${(i % 4) * 80}ms`; io.observe(el);
  });

  // Hero logo tilt
  const tilt = $('#tilt');
  if (matchMedia('(hover:hover)').matches) {
    addEventListener('mousemove', (e) => {
      const x = (e.clientX / innerWidth - .5) * 10, y = (e.clientY / innerHeight - .5) * -10;
      tilt.style.transform = `perspective(800px) rotateY(${x}deg) rotateX(${y}deg)`;
    });
  }

  // Newsletter (front-end only: connect to Mailchimp, Klaviyo, etc.)
  $('#signup').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = $('#email').value.trim(), msg = $('#msg');
    if (!/^\S+@\S+\.\S+$/.test(email)) { msg.textContent = 'Enter a valid email address.'; return; }
    msg.textContent = "You're in. Welcome to the crew.";
    e.target.reset();
  });
})();
