(function () {
  const root = document.documentElement;
  let cX = 50, cY = 50, tX = 50, tY = 50;

  window.addEventListener("mousemove", (e) => {
    tX = (e.clientX / window.innerWidth) * 100;
    tY = (e.clientY / window.innerHeight) * 100;
  });

  function tick() {
    cX += (tX - cX) * 0.12;
    cY += (tY - cY) * 0.12;
    root.style.setProperty("--x", cX + "%");
    root.style.setProperty("--y", cY + "%");
    requestAnimationFrame(tick);
  }
  tick();

  const observer = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
    { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
  );
  document.querySelectorAll(".fade-in-up").forEach((el) => observer.observe(el));
})();
