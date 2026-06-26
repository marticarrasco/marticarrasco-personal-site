import { useEffect } from "react";

export default function ScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18 },
    );

    const observeRevealElements = () => {
      document.querySelectorAll("[data-reveal]:not(.is-visible)").forEach((element) => {
        observer.observe(element);
      });
    };

    const mutationObserver = new MutationObserver(observeRevealElements);

    observeRevealElements();
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
      observer.disconnect();
    };
  }, []);

  return null;
}
