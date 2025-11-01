/**
 * Electronic Warfare Intelligence Dashboard
 * RF spectrum analysis and threat characterization
 */

class EWIntelDashboard {
  constructor() {
    this.spectrumData = [];
    this.baselineNoise = -95;
    this.interferenceFrequency = null;
    this.threatData = {};
    this.locationData = {};
    this.countermeasures = [];
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
    const teamId = urlParams.get('team') || 'ew-intel';
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

    // Initialize spectrum display
    this.initSpectrum();
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
      case 'initialize_spectrum':
        this.initializeSpectrum(params);
        break;
      case 'spectrum_anomaly':
        this.showAnomalyCaught(params);
        break;
      case 'inject_interference':
        this.injectInterference(params);
        break;
      case 'classify_emitter':
        this.classifyEmitter(params);
        break;
      case 'geolocation_update':
      case 'geolocation_refined':
        this.updateGeolocation(params);
        break;
      case 'threat_database_match':
        this.showThreatDatabase(params);
        break;
      case 'jamming_effectiveness':
        this.showEffectiveness(params);
        break;
      default:
        console.warn('Unknown command:', command);
    }
  }

  initSpectrum() {
    // Create 50 spectrum bars representing frequency range
    const container = document.getElementById('spectrumBars');
    container.innerHTML = '';

    for (let i = 0; i < 50; i++) {
      const bar = document.createElement('div');
      bar.className = 'spectrum-bar';
      const height = 10 + Math.random() * 20; // Baseline noise
      bar.style.height = `${height}%`;
      container.appendChild(bar);
      this.spectrumData.push({ height, interference: false });
    }
  }

  initializeSpectrum(params) {
    this.baselineNoise = params.baseline_noise_floor_dbm;
    document.getElementById('frequencyRange').textContent =
      `${params.frequency_range_ghz[0]} - ${params.frequency_range_ghz[1]} GHz (${params.monitored_bands.join(', ')})`;
  }

  showAnomalyCaught(params) {
    // Show brief anomaly spike
    const centerBar = Math.floor(50 * (params.frequency_ghz - 7.25) / (8.40 - 7.25));
    this.updateSpectrumBar(centerBar, 45, false);

    setTimeout(() => {
      this.updateSpectrumBar(centerBar, 15, false);
    }, 2000);
  }

  injectInterference(params) {
    // Calculate center frequency position
    const centerBar = Math.floor(50 * (params.frequency_ghz - 7.25) / (8.40 - 7.25));
    const bandwidthBars = Math.floor(50 * params.bandwidth_mhz / 1150); // Total range in MHz

    // Show interference across bandwidth
    for (let i = -bandwidthBars; i <= bandwidthBars; i++) {
      const barIndex = centerBar + i;
      if (barIndex >= 0 && barIndex < 50) {
        const height = 60 + Math.random() * 30; // High interference
        this.updateSpectrumBar(barIndex, height, true);
      }
    }

    this.interferenceFrequency = params.frequency_ghz;

    // Play alert audio if specified
    if (params.alert_audio) {
      this.playAlert();
    }
  }

  updateSpectrumBar(index, height, interference) {
    const bars = document.getElementById('spectrumBars').children;
    if (index >= 0 && index < bars.length) {
      bars[index].style.height = `${height}%`;
      if (interference) {
        bars[index].classList.add('interference');
      } else {
        bars[index].classList.remove('interference');
      }
      this.spectrumData[index] = { height, interference };
    }
  }

  classifyEmitter(params) {
    this.threatData = params;

    document.getElementById('emitterType').textContent = params.emitter_type;

    const categoryEl = document.getElementById('threatCategory');
    categoryEl.textContent = params.threat_category;
    categoryEl.className = `classification-value threat-${params.threat_category.toLowerCase()}`;

    document.getElementById('confidenceLevel').textContent = `${params.confidence}%`;
    document.getElementById('confidenceFill').style.width = `${params.confidence}%`;

    // Show characteristics if available
    if (params.characteristics) {
      const container = document.getElementById('characteristics');
      container.innerHTML = '';

      Object.entries(params.characteristics).forEach(([key, value]) => {
        const item = document.createElement('div');
        item.className = 'characteristic-item';
        item.innerHTML = `
          <div class="characteristic-label">${key.replace(/_/g, ' ').toUpperCase()}</div>
          <div class="characteristic-value">${value}</div>
        `;
        container.appendChild(item);
      });

      document.getElementById('characteristicsContainer').style.display = 'block';
    }
  }

  updateGeolocation(params) {
    this.locationData = params;

    document.getElementById('latitude').textContent = `${params.latitude.toFixed(4)}°`;
    document.getElementById('longitude').textContent = `${params.longitude.toFixed(4)}°`;
    document.getElementById('altitude').textContent = `${params.altitude_meters}m`;
    document.getElementById('method').textContent = params.method;
    document.getElementById('geoConfidence').textContent = `${params.confidence}%`;
    document.getElementById('errorRadius').textContent = `${params.error_radius_km} km`;

    if (params.nearest_landmark) {
      document.getElementById('landmarkText').textContent = params.nearest_landmark;
      document.getElementById('nearestLandmark').style.display = 'block';
    }
  }

  showThreatDatabase(params) {
    document.getElementById('systemName').textContent = params.system_name;
    document.getElementById('natoDesignation').textContent = params.nato_designation || '--';
    document.getElementById('manufacturer').textContent = params.manufacturer || '--';

    // Show countermeasures
    if (params.countermeasures && params.countermeasures.length > 0) {
      this.countermeasures = params.countermeasures;
      this.renderCountermeasures();
    }

    // Show capabilities if available
    if (params.known_capabilities && params.known_capabilities.length > 0) {
      this.showAlert({
        severity: 'info',
        title: 'Known Capabilities Identified',
        message: params.known_capabilities.join(', ')
      });
    }
  }

  renderCountermeasures() {
    const container = document.getElementById('countermeasuresList');
    container.innerHTML = '';

    this.countermeasures.forEach(measure => {
      const item = document.createElement('div');
      item.className = 'countermeasure-item';
      item.textContent = measure;
      container.appendChild(item);
    });
  }

  showEffectiveness(params) {
    const banner = document.getElementById('effectivenessBanner');
    const text = document.getElementById('effectivenessText');

    text.innerHTML = `
      <strong>${params.status}</strong> - Effectiveness: ${params.effectiveness_percent}%<br>
      Reason: ${params.reason}
    `;

    banner.classList.add('show');

    // Reduce interference visualization if effective
    if (params.effectiveness_percent < 30) {
      // Countermeasure working - reduce interference display
      this.spectrumData.forEach((data, index) => {
        if (data.interference) {
          const newHeight = 15 + Math.random() * 20; // Back to baseline
          this.updateSpectrumBar(index, newHeight, false);
        }
      });
    }

    // Auto-hide after 15 seconds
    setTimeout(() => {
      banner.classList.remove('show');
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
      message: content.body.substring(0, 200) + (content.body.length > 200 ? '...' : '')
    });
  }

  playAlert() {
    this.alertAudio.play().catch(err => {
      console.warn('Could not play alert audio:', err);
    });
  }
}

// Close alert banner
function closeAlert() {
  document.getElementById('alertBanner').classList.remove('show');
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new EWIntelDashboard();
});
