const counters = document.querySelectorAll("[data-counter]");

const animateCounter = (node) => {
  const target = Number.parseInt(node.dataset.counter || "0", 10);
  const duration = 1100;
  const startedAt = performance.now();

  const tick = (now) => {
    const progress = Math.min((now - startedAt) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    node.textContent = Math.round(target * eased).toLocaleString("en-US");

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  };

  requestAnimationFrame(tick);
};

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      animateCounter(entry.target);
      observer.unobserve(entry.target);
    }
  },
  { threshold: 0.45 },
);

for (const counter of counters) {
  observer.observe(counter);
}
