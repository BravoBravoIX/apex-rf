/**
 * Space Operations Dashboard
 * Monitors satellite health and ground station connectivity
 */

class SpaceOpsDashboard {
  constructor() {
    this.satellites = new Map();
    this.groundStations = new Map();
    this.signalHistory = [];
    this.chart = null;
    this.mqttClient = null;
    this.alertAudio = new Audio('/satcom/sounds/alert.mp3');

    this.init();
  }

  init() {
    // Start UTC clock
    this.updateClock();
    setInterval(() => this.updateClock(), 1000);

    // Get URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const teamId = urlParams.get('team') || 'spaceops';
    const exerciseName = urlParams.get('exercise') || 'satcom-disruption-scenario';

    // Initialize MQTT connection
    const brokerUrl = `ws://${window.location.hostname}:9001`;
    const topics = [
      `/exercise/${exerciseName}/team/${teamId}/feed`,
      `/exercise/${exerciseName}/timer`,
      `/exercise/${exerciseName}/control`
    ];

    console.log('Initializing MQTT connection...', { brokerUrl, topics });

    this.mqttClient = new MQTTClient(brokerUrl, topics);

    this.mqttClient.onStatus((status) => {
      this.updateConnectionStatus(status);
    });

    this.mqttClient.onMessage((topic, data) => {
      this.handleMessage(topic, data);
    });

    this.mqttClient.connect()
      .then(() => {
        console.log('Dashboard connected successfully');
      })
      .catch((error) => {
        console.error('Failed to connect:', error);
      });

    // Initialize chart
    this.initChart();
  }

  updateClock() {
    const now = new Date();
    const utcTime = now.toISOString().substr(11, 8);
    document.getElementById('utcTime').textContent = utcTime;
  }

  updateConnectionStatus(status) {
    const indicator = document.getElementById('connectionIndicator');
    const statusText = document.getElementById('connectionStatus');

    if (status === 'connected') {
      indicator.classList.add('connected');
      statusText.textContent = 'Connected';
    } else {
      indicator.classList.remove('connected');
      statusText.textContent = 'Disconnected';
    }
  }

  handleMessage(topic, data) {
    console.log('Received message:', { topic, data });

    // Handle timer updates
    if (topic.includes('/timer') && data.formatted) {
      document.getElementById('exerciseTimer').textContent = data.formatted;
      return;
    }

    // Handle different inject types
    if (data.type === 'trigger' && data.content && data.content.command) {
      this.handleTrigger(data.content.command, data.content.parameters);
    } else if (data.type === 'alert' && data.content) {
      this.showAlert(data.content);
    } else if (data.type === 'intel_report' && data.content) {
      this.showIntelReport(data.content);
    }
  }

  handleTrigger(command, params) {
    console.log('Handling trigger:', command, params);

    switch (command) {
      case 'initialize_satellites':
        this.initializeSatellites(params.satellites);
        break;
      case 'update_satellite_status':
        this.updateSatellite(params);
        break;
      case 'update_ground_stations':
        this.updateGroundStations(params.stations);
        break;
      case 'countermeasure_available':
        this.showCountermeasure(params);
        break;
      default:
        console.warn('Unknown command:', command);
    }
  }

  initializeSatellites(satellites) {
    satellites.forEach(sat => {
      this.satellites.set(sat.name, sat);
      this.addSignalDataPoint(sat.name, sat.signal_strength);
    });
    this.renderSatellites();
    this.updateChart();
  }

  updateSatellite(params) {
    const sat = this.satellites.get(params.satellite);
    if (sat) {
      Object.assign(sat, params);
      this.satellites.set(params.satellite, sat);
      this.addSignalDataPoint(params.satellite, params.signal_strength);
      this.renderSatellites();
      this.updateChart();

      // Play alert audio if specified
      if (params.alert_audio) {
        this.playAlert();
      }
    }
  }

  updateGroundStations(stations) {
    stations.forEach(station => {
      this.groundStations.set(station.name, station);
    });
    this.renderGroundStations();
  }

  renderSatellites() {
    const grid = document.getElementById('satelliteGrid');
    grid.innerHTML = '';

    this.satellites.forEach((sat, name) => {
      const card = document.createElement('div');
      card.className = 'card satellite-card';

      const statusClass = (sat.status || 'NOMINAL').toLowerCase().replace(/_/g, '_');
      const signalClass = this.getSignalClass(sat.signal_strength);

      let trendHtml = '';
      if (sat.trend) {
        const trendIcon = sat.trend === 'declining' ? '↓' : sat.trend === 'improving' ? '↑' : '→';
        const trendClass = sat.trend;
        trendHtml = `
          <div class="satellite-trend">
            <span class="trend-icon ${trendClass}">${trendIcon}</span>
            <span>${sat.trend.charAt(0).toUpperCase() + sat.trend.slice(1)}</span>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="card-header">
          <div class="satellite-name">${name}</div>
          <span class="status-badge ${statusClass}">${sat.status}</span>
        </div>
        <div class="satellite-metrics">
          <div class="metric">
            <div class="metric-label">Signal Strength</div>
            <div class="signal-bar">
              <div class="signal-fill ${signalClass}" style="width: ${sat.signal_strength}%">
                ${sat.signal_strength}%
              </div>
            </div>
          </div>
          <div class="metric">
            <div class="metric-label">Orbital Position</div>
            <div class="metric-value">${sat.orbital_position || 'N/A'}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Uplink Status</div>
            <div class="metric-value">${sat.uplink_status || 'N/A'}</div>
          </div>
          ${trendHtml}
          ${sat.note ? `<div style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.5rem;">${sat.note}</div>` : ''}
          ${sat.recommendation ? `<div style="font-size: 0.875rem; color: var(--status-critical); font-weight: 600; margin-top: 0.5rem;">${sat.recommendation}</div>` : ''}
        </div>
      `;

      grid.appendChild(card);
    });
  }

  renderGroundStations() {
    const list = document.getElementById('stationList');
    list.innerHTML = '';

    if (this.groundStations.size === 0) {
      list.innerHTML = '<div style="padding: 1rem; color: var(--text-secondary);">No ground station data available</div>';
      return;
    }

    this.groundStations.forEach((station, name) => {
      const item = document.createElement('div');
      const statusClass = (station.status || 'NOMINAL').toLowerCase();
      item.className = `station-item ${statusClass}`;

      item.innerHTML = `
        <div class="station-name">${name}</div>
        <div class="station-quality">
          <span>Link Quality: ${station.link_quality}%</span>
          <span class="status-badge ${statusClass}">${station.status}</span>
        </div>
      `;

      list.appendChild(item);
    });
  }

  showCountermeasure(params) {
    const recDiv = document.getElementById('recommendations');
    const recText = document.getElementById('recommendationText');

    recText.innerHTML = `
      <strong>${params.description}</strong><br>
      Expected Improvement: ${params.expected_improvement}<br>
      Implementation Time: ${params.implementation_time}
    `;

    recDiv.classList.add('show');

    // Auto-hide after 15 seconds
    setTimeout(() => {
      recDiv.classList.remove('show');
    }, 15000);
  }

  showAlert(content) {
    const banner = document.getElementById('alertBanner');
    const title = document.getElementById('alertTitle');
    const message = document.getElementById('alertMessage');

    banner.className = `alert-banner ${content.severity} show`;
    title.textContent = content.title;
    message.textContent = content.message;

    // Play sound for critical/warning alerts
    if (content.severity === 'critical' || content.severity === 'warning') {
      this.playAlert();
    }

    // Auto-hide after 10 seconds
    setTimeout(() => {
      banner.classList.remove('show');
    }, 10000);
  }

  showIntelReport(content) {
    // Show intel reports as alerts
    this.showAlert({
      severity: 'info',
      title: content.title,
      message: content.body
    });
  }

  playAlert() {
    this.alertAudio.play().catch(err => {
      console.warn('Could not play alert audio:', err);
    });
  }

  addSignalDataPoint(satellite, strength) {
    const now = new Date();
    const timeLabel = now.toLocaleTimeString();

    // Keep last 20 data points
    if (this.signalHistory.length >= 20) {
      this.signalHistory.shift();
    }

    this.signalHistory.push({
      time: timeLabel,
      [satellite]: strength
    });
  }

  initChart() {
    const ctx = document.getElementById('signalChart').getContext('2d');

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: []
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            position: 'top',
          },
          title: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            title: {
              display: true,
              text: 'Signal Strength (%)'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Time'
            }
          }
        }
      }
    });
  }

  updateChart() {
    if (!this.chart || this.signalHistory.length === 0) return;

    // Extract time labels
    const labels = this.signalHistory.map(d => d.time);

    // Get all unique satellite names
    const satelliteNames = Array.from(this.satellites.keys());

    // Create datasets for each satellite
    const datasets = satelliteNames.map((satName, index) => {
      const colors = [
        'rgb(52, 152, 219)',
        'rgb(46, 204, 113)',
        'rgb(155, 89, 182)',
        'rgb(52, 73, 94)'
      ];

      return {
        label: satName,
        data: this.signalHistory.map(d => d[satName] || null),
        borderColor: colors[index % colors.length],
        backgroundColor: colors[index % colors.length].replace('rgb', 'rgba').replace(')', ', 0.1)'),
        tension: 0.3,
        fill: false
      };
    });

    this.chart.data.labels = labels;
    this.chart.data.datasets = datasets;
    this.chart.update('none'); // Update without animation for real-time feel
  }

  getSignalClass(strength) {
    if (strength >= 70) return 'high';
    if (strength >= 40) return 'medium';
    return 'low';
  }
}

// Close alert banner
function closeAlert() {
  document.getElementById('alertBanner').classList.remove('show');
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new SpaceOpsDashboard();
});

// Listen for timer updates on the timer topic
// This will be handled by the existing message handler if we subscribe to the timer topic
