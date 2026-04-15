document.addEventListener("DOMContentLoaded", () => {
  function updateAppVh() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty("--app-vh", `${vh}px`);
  }

  updateAppVh();
  window.addEventListener("resize", updateAppVh);
  window.addEventListener("orientationchange", updateAppVh);

  function initSwipeDeck(worksDeck) {
    let cards = [];
    let activeCard = null;
    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    let dragPointerId = null;
    let deckAnimating = false;
    let suppressClickUntil = 0;

    const swipeAudio = new Audio("../assets/audio/swipe.mp3");
    swipeAudio.preload = "auto";

    function renderDeck() {
      cards = Array.from(worksDeck.querySelectorAll(".work-swipe-card"));
      cards.forEach((card, index) => {
        card.classList.remove("is-active", "is-next", "is-last");
        if (index === 0) card.classList.add("is-active");
        if (index === 1) card.classList.add("is-next");
        if (index >= 2) card.classList.add("is-last");
        card.style.transform = "";
        card.style.opacity = "";
      });
      activeCard = cards[0] || null;
    }

    function rotateCards() {
      if (!activeCard) return;
      worksDeck.appendChild(activeCard);
      renderDeck();
    }

    function handleDragMove(clientX) {
      if (!activeCard) return;
      currentX = clientX - startX;
      const rotate = currentX / 20;
      activeCard.style.transform = `translateX(${currentX}px) rotate(${rotate}deg)`;
    }

    function playSwipeSound() {
      try {
        swipeAudio.currentTime = 0;
        swipeAudio.volume = 0.55;
        swipeAudio.play();
      } catch {
        /* ignore autoplay / missing file */
      }
    }

    function handleDragEnd() {
      if (!activeCard) return;
      if (dragPointerId != null) {
        try {
          activeCard.releasePointerCapture(dragPointerId);
        } catch {
          /* ignore */
        }
      }
      const threshold = 80;
      const releaseX = currentX;
      if (Math.abs(releaseX) > threshold) {
        playSwipeSound();
        activeCard.style.transform = `translateX(${releaseX > 0 ? 420 : -420}px) rotate(${releaseX > 0 ? 20 : -20}deg)`;
        activeCard.style.opacity = "0";
        deckAnimating = true;
        suppressClickUntil = Date.now() + 400;
        window.setTimeout(() => {
          rotateCards();
          deckAnimating = false;
        }, 220);
      } else {
        if (Math.abs(releaseX) > 14) suppressClickUntil = Date.now() + 320;
        activeCard.style.transform = "";
        activeCard.style.opacity = "";
      }
      activeCard && activeCard.classList.remove("is-dragging");
      isDragging = false;
      dragPointerId = null;
      currentX = 0;
    }

    renderDeck();

    worksDeck.addEventListener("click", (event) => {
      if (Date.now() < suppressClickUntil) return;
      if (!activeCard) return;
      if (event.target !== activeCard && !activeCard.contains(event.target)) return;
      const href = activeCard.getAttribute("data-href");
      if (href) window.location.href = href;
    });

    worksDeck.addEventListener("pointerdown", (event) => {
      if (deckAnimating) return;
      if (!activeCard || (event.target !== activeCard && !activeCard.contains(event.target))) return;
      isDragging = true;
      dragPointerId = event.pointerId;
      startX = event.clientX;
      currentX = 0;
      activeCard.classList.add("is-dragging");
      activeCard.setPointerCapture(event.pointerId);
    });

    worksDeck.addEventListener("pointermove", (event) => {
      if (!isDragging || event.pointerId !== dragPointerId) return;
      handleDragMove(event.clientX);
    });

    worksDeck.addEventListener("pointerup", (event) => {
      if (!isDragging || event.pointerId !== dragPointerId) return;
      handleDragEnd();
    });

    worksDeck.addEventListener("pointercancel", () => {
      if (!isDragging) return;
      handleDragEnd();
    });
  }

  if (window.innerWidth <= 768) {
    document.querySelectorAll(".deck-shell .works-deck").forEach((deck) => initSwipeDeck(deck));
  } else {
    document.querySelectorAll(".works-deck .work-swipe-card[data-href]").forEach((card) => {
      card.addEventListener("click", () => {
        window.location.href = card.getAttribute("data-href");
      });
    });
  }
});

// Load user data from Firestore and display username
window.__firebaseReadyPromise
  .then(function () {
    firebase.auth().onAuthStateChanged(async (user) => {
      if (user) {
        // Get user profile from Firestore
        const userProfile = await getUserProfile(user.uid);
        const greetingEl = document.getElementById('greeting');

        if (userProfile && userProfile.username) {
          greetingEl.textContent = userProfile.username;
          try {
            localStorage.setItem('lykeion.username', userProfile.username);
          } catch (e) { /* ignore */ }
        } else {
          const fallback = user.email ? user.email.split('@')[0] : 'user';
          greetingEl.textContent = fallback;
          try {
            localStorage.setItem('lykeion.username', fallback);
          } catch (e) { /* ignore */ }
        }
      } else {
        // Not logged in, redirect to login
        window.location.href = 'login';
      }
    });
  })
  .catch(function (err) {
    console.error('Firebase init failed:', err);
  });

