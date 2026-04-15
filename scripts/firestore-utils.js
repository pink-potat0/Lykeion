// Firestore Utility Functions for User Data and Progress Tracking

// ============================================
// USER PROFILE FUNCTIONS
// ============================================

/**
 * Save or update user profile in Firestore
 * Called when user signs up or updates their profile
 */
async function saveUserProfile(userId, userData) {
    try {
        await firebase.firestore().collection('users').doc(userId).set({
            email: userData.email,
            username: userData.username,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            uid: userId
        }, { merge: true }); // merge: true allows updating without overwriting
        
        console.log('User profile saved to Firestore');
        return true;
    } catch (error) {
        console.error('Error saving user profile:', error);
        return false;
    }
}

/**
 * Save username to Firestore (simplified version)
 */
async function saveUsernameToFirestore(userId, email, username) {
    return await saveUserProfile(userId, { email, username });
}

/**
 * Get username from Firestore
 */
async function getUsernameFromFirestore(userId) {
    const profile = await getUserProfile(userId);
    return profile ? profile.username : null;
}

/**
 * Check if username is available
 */
async function isUsernameAvailable(username) {
    try {
        const usernameQuery = await firebase.firestore()
            .collection('users')
            .where('username', '==', username)
            .limit(1)
            .get();
        
        return usernameQuery.empty; // true if available, false if taken
    } catch (error) {
        console.error('Error checking username:', error);
        // If Firestore security rules prevent reading users (common during sign-up),
        // we can't reliably determine if the username is taken.
        // Return `null` so the UI doesn't incorrectly show "username taken".
        return null;
    }
}

/**
 * Get user profile from Firestore
 */
async function getUserProfile(userId) {
    try {
        const userDoc = await firebase.firestore().collection('users').doc(userId).get();
        
        if (userDoc.exists) {
            return userDoc.data();
        } else {
            return null;
        }
    } catch (error) {
        console.error('Error getting user profile:', error);
        return null;
    }
}

/**
 * Update username in Firestore
 */
async function updateUsername(userId, newUsername) {
    try {
        await firebase.firestore().collection('users').doc(userId).update({
            username: newUsername,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error('Error updating username:', error);
        return false;
    }
}

// ============================================
// PROGRESS TRACKING FUNCTIONS
// ============================================

/**
 * Save lesson progress
 * @param {string} userId - User's Firebase UID
 * @param {string} lessonId - Unique lesson identifier
 * @param {object} progressData - Progress information
 */
async function saveLessonProgress(userId, lessonId, progressData) {
    try {
        const progressRef = firebase.firestore()
            .collection('users')
            .doc(userId)
            .collection('lessons')
            .doc(lessonId);
        
        await progressRef.set({
            lessonId: lessonId,
            completed: progressData.completed || false,
            score: progressData.score || 0,
            timeSpent: progressData.timeSpent || 0, // in seconds
            lastAccessed: firebase.firestore.FieldValue.serverTimestamp(),
            completedAt: progressData.completed ? 
                firebase.firestore.FieldValue.serverTimestamp() : null,
            ...progressData // Allow additional custom fields
        }, { merge: true });
        
        // Also update the user's overall progress
        await updateUserProgressStats(userId);
        
        return true;
    } catch (error) {
        console.error('Error saving lesson progress:', error);
        return false;
    }
}

/**
 * Get lesson progress for a specific lesson
 */
async function getLessonProgress(userId, lessonId) {
    try {
        const progressDoc = await firebase.firestore()
            .collection('users')
            .doc(userId)
            .collection('lessons')
            .doc(lessonId)
            .get();
        
        if (progressDoc.exists) {
            return progressDoc.data();
        } else {
            return null; // No progress yet
        }
    } catch (error) {
        console.error('Error getting lesson progress:', error);
        return null;
    }
}

/**
 * Get all lessons progress for a user
 */
async function getAllLessonsProgress(userId) {
    try {
        const progressSnapshot = await firebase.firestore()
            .collection('users')
            .doc(userId)
            .collection('lessons')
            .get();
        
        const progress = {};
        progressSnapshot.forEach(doc => {
            progress[doc.id] = doc.data();
        });
        
        return progress;
    } catch (error) {
        console.error('Error getting all lessons progress:', error);
        return {};
    }
}

/**
 * Mark lesson as completed
 */
async function completeLesson(userId, lessonId, score = null) {
    try {
        await saveLessonProgress(userId, lessonId, {
            completed: true,
            score: score,
            completedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error('Error completing lesson:', error);
        return false;
    }
}

// ============================================
// PRACTICE SESSION FUNCTIONS
// ============================================

/**
 * Save a practice trading session
 */
async function savePracticeSession(userId, sessionData) {
    try {
        const sessionRef = firebase.firestore()
            .collection('users')
            .doc(userId)
            .collection('practiceSessions')
            .doc();
        
        await sessionRef.set({
            ...sessionData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            sessionId: sessionRef.id
        });
        
        return sessionRef.id;
    } catch (error) {
        console.error('Error saving practice session:', error);
        return null;
    }
}

/**
 * Get user's practice sessions
 */
async function getPracticeSessions(userId, limit = 10) {
    try {
        const sessionsSnapshot = await firebase.firestore()
            .collection('users')
            .doc(userId)
            .collection('practiceSessions')
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
        
        const sessions = [];
        sessionsSnapshot.forEach(doc => {
            sessions.push({ id: doc.id, ...doc.data() });
        });
        
        return sessions;
    } catch (error) {
        console.error('Error getting practice sessions:', error);
        return [];
    }
}

// ============================================
// STATISTICS FUNCTIONS
// ============================================

/**
 * Update user's overall progress statistics
 */
async function updateUserProgressStats(userId) {
    try {
        const lessonsSnapshot = await firebase.firestore()
            .collection('users')
            .doc(userId)
            .collection('lessons')
            .get();
        
        let totalLessons = 0;
        let completedLessons = 0;
        let totalScore = 0;
        let totalTimeSpent = 0;
        
        lessonsSnapshot.forEach(doc => {
            const data = doc.data();
            totalLessons++;
            if (data.completed) {
                completedLessons++;
                totalScore += data.score || 0;
            }
            totalTimeSpent += data.timeSpent || 0;
        });
        
        const progressPercentage = totalLessons > 0 ? 
            (completedLessons / totalLessons) * 100 : 0;
        const averageScore = completedLessons > 0 ? 
            totalScore / completedLessons : 0;
        
        // Update user document with stats
        await firebase.firestore().collection('users').doc(userId).update({
            stats: {
                totalLessons: totalLessons,
                completedLessons: completedLessons,
                progressPercentage: Math.round(progressPercentage),
                averageScore: Math.round(averageScore),
                totalTimeSpent: totalTimeSpent, // in seconds
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }
        });
        
        return true;
    } catch (error) {
        console.error('Error updating progress stats:', error);
        return false;
    }
}

/**
 * Get user's progress statistics
 */
async function getUserStats(userId) {
    try {
        const userDoc = await firebase.firestore().collection('users').doc(userId).get();
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            return userData.stats || {
                totalLessons: 0,
                completedLessons: 0,
                progressPercentage: 0,
                averageScore: 0,
                totalTimeSpent: 0
            };
        } else {
            return null;
        }
    } catch (error) {
        console.error('Error getting user stats:', error);
        return null;
    }
}

// ============================================
// AI CHAT HISTORY FUNCTIONS
// ============================================

/**
 * Save AI chat message
 */
async function saveChatMessage(userId, message, isUser = true) {
    try {
        const chatRef = firebase.firestore()
            .collection('users')
            .doc(userId)
            .collection('chatHistory')
            .doc();
        
        await chatRef.set({
            message: message,
            isUser: isUser,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            messageId: chatRef.id
        });
        
        return chatRef.id;
    } catch (error) {
        console.error('Error saving chat message:', error);
        return null;
    }
}

/**
 * Get chat history
 */
async function getChatHistory(userId, limit = 50) {
    try {
        const chatSnapshot = await firebase.firestore()
            .collection('users')
            .doc(userId)
            .collection('chatHistory')
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
        
        const messages = [];
        chatSnapshot.forEach(doc => {
            messages.push({ id: doc.id, ...doc.data() });
        });
        
        return messages.reverse(); // Oldest first
    } catch (error) {
        console.error('Error getting chat history:', error);
        return [];
    }
}
