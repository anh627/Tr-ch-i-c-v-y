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
        // Thêm vào GoMaster.audio object trong main.js
GoMaster.audio = {
  sounds: {},
  webAudio: null,
  enabled: true,
  
  init() {
    // Khởi tạo Web Audio API fallback
    this.initWebAudio();
    
    // Load sound effects từ file
    const soundFiles = [
      { id: 'sfxPlace', file: 'stone-place.mp3', webAudio: 'stonePlace' },
      { id: 'sfxCapture', file: 'capture.mp3', webAudio: 'capture' },
      { id: 'sfxSuccess', file: 'success.mp3', webAudio: 'success' },
      { id: 'sfxHint', file: 'hint.mp3', webAudio: 'hint' }
    ];
    
    soundFiles.forEach(sound => {
      const audio = document.getElementById(sound.id);
      if (audio) {
        this.sounds[sound.id] = {
          element: audio,
          webAudioKey: sound.webAudio
        };
        audio.volume = 0.3;
        
        // Preload
        audio.addEventListener('canplaythrough', () => {
          console.log(`✅ Loaded: ${sound.file}`);
        });
        
        audio.addEventListener('error', (e) => {
          console.log(`❌ Failed to load: ${sound.file}`, e);
        });
      }
    });
  },
  
  initWebAudio() {
    try {
      this.webAudio = new AudioGenerator();
      console.log('🎵 Web Audio API initialized');
    } catch (error) {
      console.log('Web Audio API not available');
    }
  },
  
  play(soundId) {
    if (!this.enabled) return;
    
    const sound = this.sounds[soundId];
    if (!sound) return;
    
    // Thử phát từ file MP3 trước
    try {
      const audio = sound.element;
      audio.currentTime = 0;
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.log('MP3 playback failed, trying Web Audio:', error);
          this.playWebAudio(sound.webAudioKey);
        });
      }
    } catch (error) {
      console.log('Audio element failed, trying Web Audio:', error);
      this.playWebAudio(sound.webAudioKey);
    }
  },
  
  playWebAudio(soundKey) {
    if (this.webAudio && soundKey) {
      this.webAudio.playSound(soundKey);
    }
  },
  
  // Tạo file âm thanh cho download
  generateSoundFiles() {
    if (this.webAudio) {
      window.generateAudioFiles();
    }
  }
};
const canvas = document.getElementById('playBoard');
const ctx = canvas.getContext('2d');
const sfxPlace = document.getElementById('sfxPlace');
const sfxCapture = document.getElementById('sfxCapture');
let boardSize = parseInt(document.getElementById('boardSize').value) || 9;
let canvasSize = canvas.width;
let cellSize = canvasSize / (boardSize + 1);
let board = Array(boardSize).fill().map(() => Array(boardSize).fill(null));
let currentPlayer = 'black';
let moveHistory = [];
let blackCaptures = 0;
let whiteCaptures = 0;
let gameActive = false;
let showCoords = document.getElementById('showCoords').checked;
let showLiberties = document.getElementById('showLiberties').checked;
let rankedMode = document.getElementById('rankedToggle').checked;

// Resize canvas dynamically
function resizeCanvas() {
  const container = canvas.parentElement;
  canvasSize = Math.min(container.clientWidth, container.clientHeight, 640);
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  cellSize = canvasSize / (boardSize + 1);
  redrawBoard();
}

// Draw the board
function drawBoard() {
  ctx.fillStyle = '#dc9a3e';
  ctx.fillRect(0, 0, canvasSize, canvasSize);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  for (let i = 1; i <= boardSize; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cellSize, cellSize);
    ctx.lineTo(i * cellSize, canvasSize - cellSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cellSize, i * cellSize);
    ctx.lineTo(canvasSize - cellSize, i * cellSize);
    ctx.stroke();
  }

  // Draw star points
  const starPoints = boardSize === 9 ? [[2,2], [2,6], [6,2], [6,6], [4,4]] :
                     boardSize === 13 ? [[3,3], [3,9], [9,3], [9,9], [6,6]] :
                     [[3,3], [3,9], [3,15], [9,3], [9,9], [9,15], [15,3], [15,9], [15,15]];
  ctx.fillStyle = '#000';
  starPoints.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc((x + 1) * cellSize, (y + 1) * cellSize, 3, 0, 2 * Math.PI);
    ctx.fill();
  });

  // Draw coordinates if enabled
  if (showCoords) {
    ctx.fillStyle = '#000';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < boardSize; i++) {
      ctx.fillText(String.fromCharCode(65 + i), (i + 1) * cellSize, cellSize / 2);
      ctx.fillText(String.fromCharCode(65 + i), (i + 1) * cellSize, canvasSize - cellSize / 2);
      ctx.fillText(i + 1, cellSize / 2, (i + 1) * cellSize);
      ctx.fillText(i + 1, canvasSize - cellSize / 2, (i + 1) * cellSize);
    }
  }
}

// Draw a stone
function drawStone(x, y, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc((x + 1) * cellSize, (y + 1) * cellSize, cellSize / 2 - 2, 0, 2 * Math.PI);
  ctx.fill();
  if (color === 'black') {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  if (showLiberties) {
    const liberties = getLiberties(x, y, color);
    ctx.fillStyle = color === 'black' ? '#fff' : '#000';
    ctx.font = '10px Arial';
    ctx.fillText(liberties, (x + 1) * cellSize, (y + 1) * cellSize);
  }
}

// Redraw board and stones
function redrawBoard() {
  drawBoard();
  for (let x = 0; x < boardSize; x++) {
    for (let y = 0; y < boardSize; y++) {
      if (board[x][y]) {
        drawStone(x, y, board[x][y]);
      }
    }
  }
}

// Calculate liberties for a group
function getLiberties(x, y, color, visited = new Set()) {
  if (x < 0 || x >= boardSize || y < 0 || y >= boardSize || visited.has(`${x},${y}`)) return 0;
  visited.add(`${x},${y}`);
  if (board[x][y] === null) return 1;
  if (board[x][y] !== color) return 0;
  let liberties = 0;
  const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  for (const [dx, dy] of directions) {
    liberties += getLiberties(x + dx, y + dy, color, visited);
  }
  return liberties;
}

// Remove captured stones
function removeCapturedStones(x, y, color) {
  const opponentColor = color === 'black' ? 'white' : 'black';
  const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  let captured = 0;
  for (const [dx, dy] of directions) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize && board[nx][ny] === opponentColor) {
      if (getLiberties(nx, ny, opponentColor) === 0) {
        captured += removeGroup(nx, ny, opponentColor);
      }
    }
  }
  if (captured > 0) {
    sfxCapture.play();
    if (color === 'black') {
      whiteCaptures += captured;
      document.getElementById('whiteCaptures').textContent = whiteCaptures;
    } else {
      blackCaptures += captured;
      document.getElementById('blackCaptures').textContent = blackCaptures;
    }
  }
}

function removeGroup(x, y, color, visited = new Set()) {
  if (x < 0 || x >= boardSize || y < 0 || y >= boardSize || board[x][y] !== color || visited.has(`${x},${y}`)) return 0;
  visited.add(`${x},${y}`);
  board[x][y] = null;
  let count = 1;
  const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  for (const [dx, dy] of directions) {
    count += removeGroup(x + dx, y + dy, color, visited);
  }
  return count;
}

// Check if a move is legal (basic: not suicide, not occupied)
function isLegalMove(x, y, color) {
  if (x < 0 || x >= boardSize || y < 0 || y >= boardSize || board[x][y]) return false;
  board[x][y] = color;
  const liberties = getLiberties(x, y, color);
  board[x][y] = null;
  return liberties > 0;
}

// Handle stone placement
canvas.addEventListener('click', (event) => {
  if (!gameActive) return;
  const rect = canvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;
  const x = Math.round((mouseX - cellSize) / cellSize);
  const y = Math.round((mouseY - cellSize) / cellSize);
  if (x >= 0 && x < boardSize && y >= 0 && y < boardSize && isLegalMove(x, y, currentPlayer)) {
    board[x][y] = currentPlayer;
    moveHistory.push({ x, y, color: currentPlayer, blackCaptures, whiteCaptures });
    removeCapturedStones(x, y, currentPlayer);
    sfxPlace.play();
    drawStone(x, y, currentPlayer);
    document.getElementById('playStatus').querySelector('.status-text').textContent = `${currentPlayer === 'black' ? 'Trắng' : 'Đen'} lượt`;
    currentPlayer = currentPlayer === 'black' ? 'white' : 'black';
    if (document.getElementById('opponentType').value === 'ai' && currentPlayer === 'white') {
      setTimeout(makeAIMove, 500); // Simple AI move
    }
  }
});

// Start game
document.getElementById('btnStart').addEventListener('click', () => {
  boardSize = parseInt(document.getElementById('boardSize').value) || 9;
  board = Array(boardSize).fill().map(() => Array(boardSize).fill(null));
  currentPlayer = 'black';
  moveHistory = [];
  blackCaptures = 0;
  whiteCaptures = 0;
  gameActive = true;
  showCoords = document.getElementById('showCoords').checked;
  showLiberties = document.getElementById('showLiberties').checked;
  rankedMode = document.getElementById('rankedToggle').checked;
  document.getElementById('blackCaptures').textContent = '0';
  document.getElementById('whiteCaptures').textContent = '0';
  document.getElementById('playStatus').querySelector('.status-text').textContent = 'Đen lượt';
  document.getElementById('btnHint').disabled = rankedMode;
  resizeCanvas();
});

// Pass turn
document.getElementById('btnPass').addEventListener('click', () => {
  if (!gameActive) return;
  moveHistory.push({ pass: true, color: currentPlayer, blackCaptures, whiteCaptures });
  document.getElementById('playStatus').querySelector('.status-text').textContent = `${currentPlayer === 'black' ? 'Trắng' : 'Đen'} lượt`;
  currentPlayer = currentPlayer === 'black' ? 'white' : 'black';
  if (moveHistory.length >= 2 && moveHistory[moveHistory.length - 1].pass && moveHistory[moveHistory.length - 2].pass) {
    endGame();
  }
});

// Resign
document.getElementById('btnResign').addEventListener('click', () => {
  if (!gameActive) return;
  gameActive = false;
  const winner = currentPlayer === 'black' ? 'Trắng' : 'Đen';
  document.getElementById('playStatus').querySelector('.status-text').textContent = `${winner} thắng do đối thủ đầu hàng!`;
  updateSummary(`${winner} thắng do đối thủ đầu hàng!`);
});

// Undo move
document.getElementById('btnUndo').addEventListener('click', () => {
  if (!gameActive || moveHistory.length === 0) return;
  const lastMove = moveHistory.pop();
  if (lastMove.pass) {
    currentPlayer = lastMove.color;
    document.getElementById('playStatus').querySelector('.status-text').textContent = `${currentPlayer === 'black' ? 'Đen' : 'Trắng'} lượt`;
    return;
  }
  board[lastMove.x][lastMove.y] = null;
  blackCaptures = lastMove.blackCaptures;
  whiteCaptures = lastMove.whiteCaptures;
  document.getElementById('blackCaptures').textContent = blackCaptures;
  document.getElementById('whiteCaptures').textContent = whiteCaptures;
  currentPlayer = lastMove.color;
  redrawBoard();
  document.getElementById('playStatus').querySelector('.status-text').textContent = `${currentPlayer === 'black' ? 'Đen' : 'Trắng'} lượt`;
});

// Basic AI move (placeholder)
function makeAIMove() {
  const aiLevel = document.getElementById('aiLevel').value;
  let move;
  if (aiLevel === 'easy') {
    // Random legal move
    const possibleMoves = [];
    for (let x = 0; x < boardSize; x++) {
      for (let y = 0; y < boardSize; y++) {
        if (isLegalMove(x, y, currentPlayer)) {
          possibleMoves.push({ x, y });
        }
      }
    }
    if (possibleMoves.length > 0) {
      move = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
      board[move.x][move.y] = currentPlayer;
      moveHistory.push({ x: move.x, y: move.y, color: currentPlayer, blackCaptures, whiteCaptures });
      removeCapturedStones(move.x, move.y, currentPlayer);
      sfxPlace.play();
      drawStone(move.x, move.y, currentPlayer);
      currentPlayer = 'black';
      document.getElementById('playStatus').querySelector('.status-text').textContent = 'Đen lượt';
    }
  }
}

// Hint (simple: suggest a random legal move)
document.getElementById('btnHint').addEventListener('click', () => {
  if (!gameActive || rankedMode) return;
  const possibleMoves = [];
  for (let x = 0; x < boardSize; x++) {
    for (let y = 0; y < boardSize; y++) {
      if (isLegalMove(x, y, currentPlayer)) {
        possibleMoves.push({ x, y });
      }
    }
  }
  if (possibleMoves.length > 0) {
    const move = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc((move.x + 1) * cellSize, (move.y + 1) * cellSize, cellSize / 2 - 2, 0, 2 * Math.PI);
    ctx.stroke();
    setTimeout(redrawBoard, 2000);
  }
});

// End game and calculate score (simplified)
function endGame() {
  gameActive = false;
  let blackScore = blackCaptures;
  let whiteScore = whiteCaptures + parseFloat(document.getElementById('komi').value);
  const ruleSet = document.getElementById('ruleSet').value;
  if (ruleSet === 'chinese') {
    for (let x = 0; x < boardSize; x++) {
      for (let y = 0; y < boardSize; y++) {
        if (board[x][y] === 'black') blackScore++;
        else if (board[x][y] === 'white') whiteScore++;
      }
    }
  }
  const winner = blackScore > whiteScore ? 'Đen' : 'Trắng';
  const scoreText = `Đen: ${blackScore}, Trắng: ${whiteScore}. ${winner} thắng!`;
  document.getElementById('playStatus').querySelector('.status-text').textContent = scoreText;
  updateSummary(scoreText);
}

// Update post-game summary
function updateSummary(text) {
  const summary = document.getElementById('postGameSummary');
  summary.innerHTML = `<p>${text}</p>`;
}

// Initialize
if (!ctx) {
  alert('Trình duyệt không hỗ trợ canvas.');
} else {
  window.addEventListener('resize', resizeCanvas);
  document.getElementById('showCoords').addEventListener('change', () => {
    showCoords = document.getElementById('showCoords').checked;
    redrawBoard();
  });
  document.getElementById('showLiberties').addEventListener('change', () => {
    showLiberties = document.getElementById('showLiberties').checked;
    redrawBoard();
  });
  resizeCanvas();
}
