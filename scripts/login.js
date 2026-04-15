// Tab switching with animation
const tabs = document.querySelectorAll('.auth-tab');
const forms = document.querySelectorAll('.auth-form');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;
    tabs.forEach(t => t.classList.remove('active'));
    forms.forEach(f => {
      f.classList.remove('active');
      f.style.animation = 'none';
      setTimeout(() => {
        f.style.animation = '';
      }, 10);
    });

    tab.classList.add('active');
    const targetForm = document.getElementById(targetTab === 'signin' ? 'signinForm' : 'signupForm');
    setTimeout(() => {
      targetForm.classList.add('active');
    }, 50);
  });
});

// Password visibility toggle
document.querySelectorAll('.password-toggle').forEach(toggle => {
  toggle.addEventListener('click', () => {
    const targetId = toggle.getAttribute('data-target');
    const passwordInput = document.getElementById(targetId);
    const eyeIcon = toggle.querySelector('.eye-icon img');

    if (passwordInput.type === 'password') {
      passwordInput.type = 'text';
      eyeIcon.src = '../assets/icons/icons8-closed-eye-48.png';
      eyeIcon.alt = 'Hide password';
    } else {
      passwordInput.type = 'password';
      eyeIcon.src = '../assets/icons/icons8-eye-24.png';
      eyeIcon.alt = 'Show password';
    }
  });
});

// Form submission handlers with Firebase Auth
document.getElementById('signinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msgEl = document.getElementById('msg');
  const email = document.getElementById('signinEmail').value;
  const password = document.getElementById('signinPassword').value;

  msgEl.textContent = 'Signing in...';
  msgEl.className = 'auth-message loading';

  try {
    await window.__firebaseReadyPromise;
    const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
    const userData = await getUserProfile(userCredential.user.uid);
    let displayUsername;
    if (!userData || !userData.username) {
      displayUsername = userCredential.user.displayName || email.split('@')[0];
      await saveUsernameToFirestore(userCredential.user.uid, email, displayUsername);
    } else {
      displayUsername = userData.username;
    }
    try {
      localStorage.setItem('lykeion.username', displayUsername);
    } catch (e) { /* ignore */ }

    msgEl.textContent = 'Sign in successful!';
    msgEl.className = 'auth-message success';
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 1000);
  } catch (error) {
    let errorMessage = 'Sign in failed. ';
    switch (error.code) {
      case 'auth/user-not-found':
        errorMessage += 'No account found with this email.';
        break;
      case 'auth/wrong-password':
        errorMessage += 'Incorrect password.';
        break;
      case 'auth/invalid-email':
        errorMessage += 'Invalid email address.';
        break;
      case 'auth/user-disabled':
        errorMessage += 'This account has been disabled.';
        break;
      default:
        errorMessage += error.message;
    }
    msgEl.textContent = errorMessage;
    msgEl.className = 'auth-message error';
  }
});

document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msgEl = document.getElementById('msg');
  const email = document.getElementById('signupEmail').value;
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('signupPassword').value;

  msgEl.textContent = 'Creating account...';
  msgEl.className = 'auth-message loading';

  try {
    await window.__firebaseReadyPromise;
    if (!username) {
      msgEl.textContent = 'Please enter a username.';
      msgEl.className = 'auth-message error';
      return;
    }

    const usernameAvailable = await isUsernameAvailable(username);
    if (usernameAvailable === false) {
      msgEl.textContent = 'Username already taken. Please choose another.';
      msgEl.className = 'auth-message error';
      return;
    }

    const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
    await userCredential.user.updateProfile({
      displayName: username
    });

    await saveUserProfile(userCredential.user.uid, {
      email: email,
      username: username
    });

    try {
      localStorage.setItem('lykeion.username', username);
    } catch (e) { /* ignore */ }

    msgEl.textContent = 'Account created! Redirecting...';
    msgEl.className = 'auth-message success';
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 1000);
  } catch (error) {
    let errorMessage = 'Sign up failed. ';
    switch (error.code) {
      case 'auth/email-already-in-use':
        errorMessage += 'This email is already registered.';
        break;
      case 'auth/invalid-email':
        errorMessage += 'Invalid email address.';
        break;
      case 'auth/weak-password':
        errorMessage += 'Password should be at least 6 characters.';
        break;
      default:
        errorMessage += error.message;
    }
    msgEl.textContent = errorMessage;
    msgEl.className = 'auth-message error';
  }
});

