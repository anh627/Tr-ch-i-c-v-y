// main.js - Core functionality for GoMaster
'use strict';

// Global state management
const GoMaster = {
  // Application state
  state: {
    currentTheme: 'light',
    currentPage: document.body.dataset.page || 'home',
    user: {
      name: '',
      country: 'VN',
      bio: '',
      stats: {
        gamesPlayed: 0,
        gamesWon: 0,
        currentRank: '30k',
        totalPlayTime: 0
      },
      achievements: []
    },
    settings: {
      showCoordinates: true,
      showLiberties: false,
      soundEnabled: true,
      animationsEnabled: true
    }
  },

  // Audio system
  audio: {
    sounds: {},
    enabled: true,
    
    init() {
      // Load sound effects
      const soundFiles = [
        'sfxPlace',
        'sfxCapture', 
        'sfxSuccess',
        'sfxHint'
      ];
      
      soundFiles.forEach(id => {
        const audio = document.getElementById(id);
        if (audio) {
          this.sounds[id] = audio;
          audio.volume = 0.3;
        }
      });
    },
    
    play(soundId) {
      if (!this.enabled || !this.sounds[soundId]) return;
      
      try {
        const sound = this.sounds[soundId];
        sound.currentTime = 0;
        sound.play().catch(e => {
          console.log('Audio play failed:', e);
        });
      } catch (error) {
        console.log('Audio error:', error);
      }
    },
    
    toggle() {
      this.enabled = !this.enabled;
      this.saveSettings();
    },
    
    saveSettings() {
      localStorage.setItem('gomaster_audio_enabled', this.enabled);
    },
    
    loadSettings() {
      const saved = localStorage.getItem('gomaster_audio_enabled');
      if (saved !== null) {
        this.enabled = JSON.parse(saved);
      }
    }
  },

  // Theme management
  theme: {
    init() {
      this.loadTheme();
      this.setupThemeToggle();
    },
    
    loadTheme() {
      const savedTheme = localStorage.getItem('gomaster_theme') || 'light';
      this.setTheme(savedTheme);
    },
    
    setTheme(theme) {
      GoMaster.state.currentTheme = theme;
      document.documentElement.setAttribute('data-theme', theme);
      
      // Update theme toggle button
      const themeToggle = document.getElementById('themeToggle');
      if (themeToggle) {
        themeToggle.setAttribute('aria-pressed', theme === 'dark');
        const icon = themeToggle.querySelector('.theme-icon');
        if (icon) {
          icon.textContent = theme === 'dark' ? '☀️' : '🌙';
        }
      }
      
      localStorage.setItem('gomaster_theme', theme);
    },
    
    toggle() {
      const newTheme = GoMaster.state.currentTheme === 'light' ? 'dark' : 'light';
      this.setTheme(newTheme);
      
      // Add visual feedback
      this.showThemeChangeEffect();
    },
    
    showThemeChangeEffect() {
      const body = document.body;
      body.style.transition = 'background-color 0.3s ease, color 0.3s ease';
      
      setTimeout(() => {
        body.style.transition = '';
      }, 300);
    },
    
    setupThemeToggle() {
      const themeToggle = document.getElementById('themeToggle');
      if (themeToggle) {
        themeToggle.addEventListener('click', () => {
          this.toggle();
          GoMaster.audio.play('sfxPlace');
        });
      }
    }
  },

  // Navigation and page management
  navigation: {
    init() {
      this.setupNavigation();
      this.setupSkipLink();
      this.updateActiveNavItem();
    },
    
    setupNavigation() {
      // Add hover effects and analytics
      const navLinks = document.querySelectorAll('.nav a');
      navLinks.forEach(link => {
        link.addEventListener('mouseenter', () => {
          if (!link.classList.contains('nav-active')) {
            GoMaster.utils.addHoverEffect(link);
          }
        });
        
        link.addEventListener('click', (e) => {
          this.handleNavClick(e, link);
        });
      });
    },
    
    setupSkipLink() {
      const skipLink = document.querySelector('.skip-link');
      if (skipLink) {
        skipLink.addEventListener('click', (e) => {
          e.preventDefault();
          const target = document.querySelector(skipLink.getAttribute('href'));
          if (target) {
            target.focus();
            target.scrollIntoView({ behavior: 'smooth' });
          }
        });
      }
    },
    
    updateActiveNavItem() {
      const currentPage = GoMaster.state.currentPage;
      const navLinks = document.querySelectorAll('.nav a');
      
      navLinks.forEach(link => {
        const href = link.getAttribute('href');
        const isActive = (
          (currentPage === 'home' && href === 'index.html') ||
          (currentPage !== 'home' && href.includes(currentPage))
        );
        
        if (isActive) {
          link.classList.add('nav-active');
          link.setAttribute('aria-current', 'page');
        } else {
          link.classList.remove('nav-active');
          link.removeAttribute('aria-current');
        }
      });
    },
    
    handleNavClick(e, link) {
      // Add click animation
      GoMaster.utils.addClickEffect(link);
      GoMaster.audio.play('sfxPlace');
      
      // Track navigation (for analytics)
      const page = link.getAttribute('href');
      GoMaster.analytics.trackNavigation(page);
    }
  },

  // User data management
  userData: {
    init() {
      this.loadUserData();
    },
    
    loadUserData() {
      try {
        const saved = localStorage.getItem('gomaster_user_data');
        if (saved) {
          const userData = JSON.parse(saved);
          GoMaster.state.user = { ...GoMaster.state.user, ...userData };
        }
      } catch (error) {
        console.error('Error loading user data:', error);
      }
    },
    
    saveUserData() {
      try {
        localStorage.setItem('gomaster_user_data', JSON.stringify(GoMaster.state.user));
      } catch (error) {
        console.error('Error saving user data:', error);
      }
    },
    
    updateStats(gameResult) {
      const stats = GoMaster.state.user.stats;
      stats.gamesPlayed++;
      
      if (gameResult.won) {
        stats.gamesWon++;
      }
      
      if (gameResult.playTime) {
        stats.totalPlayTime += gameResult.playTime;
      }
      
      // Update rank based on performance
      this.updateRank(gameResult);
      
      this.saveUserData();
      this.checkAchievements();
    },
    
    updateRank(gameResult) {
      // Simple ranking system
      const ranks = [
        '30k', '29k', '28k', '27k', '26k', '25k', '24k', '23k', '22k', '21k',
        '20k', '19k', '18k', '17k', '16k', '15k', '14k', '13k', '12k', '11k',
        '10k', '9k', '8k', '7k', '6k', '5k', '4k', '3k', '2k', '1k',
        '1d', '2d', '3d', '4d', '5d', '6d', '7d', '8d', '9d'
      ];
      
      const currentRankIndex = ranks.indexOf(GoMaster.state.user.stats.currentRank);
      const winRate = GoMaster.state.user.stats.gamesWon / GoMaster.state.user.stats.gamesPlayed;
      
      // Promote if win rate > 60% and played enough games
      if (winRate > 0.6 && GoMaster.state.user.stats.gamesPlayed >= 10) {
        if (currentRankIndex < ranks.length - 1) {
          GoMaster.state.user.stats.currentRank = ranks[currentRankIndex + 1];
          this.showRankUpNotification();
        }
      }
    },
    
    showRankUpNotification() {
      GoMaster.notifications.show({
        type: 'success',
        title: '🎉 Thăng hạng!',
        message: `Chúc mừng! Bạn đã lên ${GoMaster.state.user.stats.currentRank}!`,
        duration: 5000
      });
      
      GoMaster.audio.play('sfxSuccess');
    },
    
    checkAchievements() {
      const stats = GoMaster.state.user.stats;
      const achievements = GoMaster.state.user.achievements;
      
      const possibleAchievements = [
        {
          id: 'first_game',
          name: '🎮 Ván đầu tiên',
          description: 'Hoàn thành ván đấu đầu tiên',
          condition: () => stats.gamesPlayed >= 1
        },
        {
          id: 'ten_games',
          name: '🔥 Nhiệt huyết',
          description: 'Chơi 10 ván',
          condition: () => stats.gamesPlayed >= 10
        },
        {
          id: 'first_win',
          name: '🏆 Chiến thắng đầu tiên',
          description: 'Giành chiến thắng đầu tiên',
          condition: () => stats.gamesWon >= 1
        },
        {
          id: 'win_streak',
          name: '⚡ Thần tốc',
          description: 'Thắng 5 ván liên tiếp',
          condition: () => this.checkWinStreak() >= 5
        },
        {
          id: 'rank_up',
          name: '📈 Tiến bộ',
          description: 'Thăng hạng lần đầu',
          condition: () => stats.currentRank !== '30k'
        }
      ];
      
      possibleAchievements.forEach(achievement => {
        if (!achievements.includes(achievement.id) && achievement.condition()) {
          achievements.push(achievement.id);
          this.showAchievementUnlocked(achievement);
        }
      });
    },
    
    checkWinStreak() {
      // This would need to track recent game results
      // For now, return a simple calculation
      const winRate = GoMaster.state.user.stats.gamesWon / GoMaster.state.user.stats.gamesPlayed;
      return winRate > 0.8 ? 5 : 0;
    },
    
    showAchievementUnlocked(achievement) {
      GoMaster.notifications.show({
        type: 'achievement',
        title: '🏅 Thành tựu mới!',
        message: `${achievement.name}: ${achievement.description}`,
        duration: 6000
      });
      
      GoMaster.audio.play('sfxSuccess');
    }
  },

  // Notification system
  notifications: {
    container: null,
    
    init() {
      this.createContainer();
    },
    
    createContainer() {
      if (this.container) return;
      
      this.container = document.createElement('div');
      this.container.className = 'notifications-container';
      this.container.setAttribute('aria-live', 'polite');
      this.container.setAttribute('aria-label', 'Thông báo');
      document.body.appendChild(this.container);
    },
    
    show({ type = 'info', title, message, duration = 4000 }) {
      const notification = document.createElement('div');
      notification.className = `notification notification-${type}`;
      
      const icon = this.getIcon(type);
      
      notification.innerHTML = `
        <div class="notification-content">
          <div class="notification-icon">${icon}</div>
          <div class="notification-text">
            ${title ? `<div class="notification-title">${title}</div>` : ''}
            <div class="notification-message">${message}</div>
          </div>
          <button class="notification-close" aria-label="Đóng thông báo">✖️</button>
        </div>
      `;
      
      // Add close functionality
      const closeBtn = notification.querySelector('.notification-close');
      closeBtn.addEventListener('click', () => {
        this.remove(notification);
      });
      
      // Add to container
      this.container.appendChild(notification);
      
      // Animate in
      setTimeout(() => {
        notification.classList.add('notification-show');
      }, 10);
      
      // Auto remove
      if (duration > 0) {
        setTimeout(() => {
          this.remove(notification);
        }, duration);
      }
      
      return notification;
    },
    
    remove(notification) {
      notification.classList.add('notification-hide');
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    },
    
    getIcon(type) {
      const icons = {
        info: 'ℹ️',
        success: '✅',
        warning: '⚠️',
        error: '❌',
        achievement: '🏅'
      };
      return icons[type] || icons.info;
    }
  },

  // Utility functions
  utils: {
    // Add visual effects
    addHoverEffect(element) {
      element.style.transform = 'translateY(-2px)';
      setTimeout(() => {
        element.style.transform = '';
      }, 200);
    },
    
    addClickEffect(element) {
      element.style.transform = 'scale(0.95)';
      setTimeout(() => {
        element.style.transform = '';
      }, 150);
    },
    
    // Format time
    formatTime(seconds) {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      
      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    },
    
    // Format numbers
    formatNumber(num) {
      if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
      }
      if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
      }
      return num.toString();
    },
    
    // Debounce function
    debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
