# IQ Decode Dashboards Implementation Plan

## Overview
Create three new dashboards that decode and display data from IQ files in real-time, demonstrating the functional impact of RF jamming on mission-critical communications.

## Architecture

### Current Setup
```
IQ File → SDR Service (RTL-TCP + Signal Mixer) → GQRX
                                                ↓
                                          Team Dashboard (RF Control)
```

### New Setup
```
IQ File → SDR Service (RTL-TCP + Signal Mixer) → GQRX
            ↓
            └─→ Decode Service → WebSocket → Decode Dashboards
                  - SSTV Decoder
                  - AIS Decoder
                  - Metrics Analyzer
```

---

## Dashboard 1: SSTV Image Decoder

### Purpose
Decode Slow Scan TV images from the `sstv-20m.iq` file, showing real-time image reception that degrades under jamming.

### Features
- **Live SSTV image decoding** (line-by-line as it comes in)
- **Source image display** (expected image)
- **Received image display** (actual decoded result)
- **Decode quality metrics** (success rate, corruption level)
- **Visual comparison** side-by-side
- **Status indicators**: "RECEIVING IMAGE" / "DECODE FAILED" / "COMPLETE"

### Technical Approach
**Decoder:** Python-based SSTV decoder
- Library: `pySSTV` or custom SSTV decoder (Martin 1, Robot 36, etc.)
- Input: IQ samples → audio demod → SSTV decode
- Output: Progressive image updates via WebSocket

**Dashboard:** React + Canvas for image rendering
- Real-time image updates as scan lines decode
- Shows corruption/noise when jammed
- Highlights missing/corrupted scan lines

### Data Flow
```
sstv-20m.iq → SDR Service → Audio Samples → SSTV Decoder
                                                  ↓
                                            WebSocket
                                                  ↓
                                          SSTV Dashboard
                                          - Progressive image
                                          - Decode status
                                          - Quality metrics
```

---

## Dashboard 2: AIS Maritime Tracking

### Purpose
Decode AIS messages from `ais-vhf.iq` file, showing ship positions/data that disappear under jamming.

### Features
- **Interactive map** (OpenStreetMap/Leaflet)
- **Ship markers** with decoded AIS data:
  - MMSI number
  - Ship name (if available)
  - Position (lat/lon)
  - Speed/heading
  - Vessel type
- **Message log** showing decoded AIS packets
- **Statistics**: Messages received, decode success rate
- **Visual feedback**: Ships disappear/gray out when signal is jammed

### Technical Approach
**Decoder:** Python AIS decoder
- Library: `pyais` or `ais` library
- Input: IQ samples → FM demod → GMSK demod → AIS decode
- Output: Decoded AIS messages (JSON) via WebSocket

**Dashboard:** React + Leaflet.js
- Real-time map updates
- Ship markers appear/update as messages decoded
- Shows "LOST CONTACT" when jamming prevents decoding

### Data Flow
```
ais-vhf.iq → SDR Service → FM/GMSK Demod → AIS Decoder
                                                  ↓
                                            WebSocket
                                                  ↓
                                          AIS Dashboard
                                          - Map with ships
                                          - Message log
                                          - Stats
```

---

## Dashboard 3: Real-Time Signal Metrics

### Purpose
Analyze IQ samples in real-time to show quantitative impact of jamming on signal quality.

### Features
- **SNR (Signal-to-Noise Ratio)** - drops when jammed
- **BER (Bit Error Rate)** - increases under jamming
- **Packet Success Rate** - percentage of successful decodes
- **Signal Strength** - dBm measurement
- **Spectral occupancy** - bandwidth usage
- **Real-time graphs** - showing degradation over time
- **Alert thresholds** - "CRITICAL" when metrics fall below usable levels

### Technical Approach
**Analyzer:** Python DSP analysis
- Compute SNR from IQ samples
- Analyze signal strength
- Detect and count errors/corruption
- Calculate statistics over time windows

**Dashboard:** React + Chart.js/Recharts
- Live updating line graphs
- Gauge displays for current values
- Color-coded alerts (green/yellow/red)
- Historical trending

### Data Flow
```
Any IQ File → SDR Service → IQ Samples → Metrics Analyzer
                                              ↓
                                        WebSocket
                                              ↓
                                      Metrics Dashboard
                                      - SNR graph
                                      - BER graph
                                      - Success rate
                                      - Signal strength
```

---

## File Structure

### New Directories
```
apex-rf/
├── decode-service/              # NEW - Python decode service
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py             # FastAPI + WebSocket server
│   │   ├── decoders/
│   │   │   ├── sstv_decoder.py
│   │   │   ├── ais_decoder.py
│   │   │   └── metrics_analyzer.py
│   │   └── utils/
│   │       ├── iq_processor.py
│   │       └── audio_demod.py
│
├── team-dashboard-sstv/         # NEW - SSTV decode dashboard
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   │   ├── pages/
│   │   │   └── SSTVDecodePage.tsx
│   │   ├── components/
│   │   │   ├── ImageCanvas.tsx
│   │   │   ├── DecodeStatus.tsx
│   │   │   └── QualityMetrics.tsx
│   │   └── hooks/
│   │       └── useWebSocket.ts
│
├── team-dashboard-ais/          # NEW - AIS map dashboard
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   │   ├── pages/
│   │   │   └── AISMapPage.tsx
│   │   ├── components/
│   │   │   ├── ShipMap.tsx
│   │   │   ├── MessageLog.tsx
│   │   │   └── ShipDetails.tsx
│   │   └── hooks/
│   │       └── useWebSocket.ts
│
├── team-dashboard-metrics/      # NEW - Metrics dashboard
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   │   ├── pages/
│   │   │   └── MetricsPage.tsx
│   │   ├── components/
│   │   │   ├── SNRChart.tsx
│   │   │   ├── BERChart.tsx
│   │   │   ├── SignalGauge.tsx
│   │   │   └── AlertPanel.tsx
│   │   └── hooks/
│   │       └── useWebSocket.ts
│
└── scenarios/
    └── sdr-rf-monitoring-scenario.json  # UPDATED - add new teams
```

---

## Scenario Configuration Updates

### Updated `sdr-rf-monitoring-scenario.json`
```json
{
  "id": "sdr-rf-monitoring-scenario",
  "name": "SDR/RF Spectrum Monitoring & Decode Analysis",
  "description": "Real-time RF spectrum monitoring with live signal decoding. Analyze signals and observe functional impact of jamming.",
  "version": "2.0.0",
  "duration_minutes": 30,
  "iq_file": "/iq_library/demo.iq",
  "sample_rate": 250000,
  "teams": [
    {
      "id": "sdr-rf",
      "name": "RF Analysis Team",
      "description": "Monitor RF spectrum and identify interference",
      "timeline_file": "timelines/timeline-sdr-rf.json",
      "dashboard_port": 3300,
      "dashboard_image": "team-dashboard-sdr:latest"
    },
    {
      "id": "sstv-decode",
      "name": "SSTV Image Reception",
      "description": "Decode slow-scan TV images from HF amateur radio",
      "timeline_file": "timelines/timeline-sstv.json",
      "dashboard_port": 3301,
      "dashboard_image": "team-dashboard-sstv:latest"
    },
    {
      "id": "ais-tracking",
      "name": "Maritime AIS Tracking",
      "description": "Monitor and decode AIS ship tracking messages",
      "timeline_file": "timelines/timeline-ais.json",
      "dashboard_port": 3302,
      "dashboard_image": "team-dashboard-ais:latest"
    },
    {
      "id": "signal-metrics",
      "name": "Signal Quality Analysis",
      "description": "Real-time signal quality and performance metrics",
      "timeline_file": "timelines/timeline-metrics.json",
      "dashboard_port": 3303,
      "dashboard_image": "team-dashboard-metrics:latest"
    }
  ]
}
```

---

## Docker Compose Updates

### Add to `docker-compose.yml`
```yaml
services:
  # Existing services...

  decode-service:
    build: ./decode-service
    container_name: scip-decode-service
    ports:
      - "8002:8002"  # WebSocket server
    volumes:
      - ./scenarios/iq_library:/iq_library:ro
    environment:
      - MQTT_BROKER=mqtt
      - WS_PORT=8002
    networks:
      - scip-network
    depends_on:
      - mqtt
```

---

## Implementation Phases

### Phase 1: Decode Service Foundation
**Goal:** Get decode service running with basic IQ processing

**Tasks:**
1. Create `decode-service/` directory structure
2. Set up FastAPI with WebSocket support
3. Implement IQ file reader (tap into SDR service stream or read directly)
4. Create basic audio demodulation (FM, SSB)
5. Set up MQTT subscriber to know current IQ file and jamming state
6. Build WebSocket server for pushing decode results

**Deliverable:** Decode service running, can read IQ, no decoders yet

---

### Phase 2: SSTV Decoder + Dashboard
**Goal:** First functional decode dashboard showing SSTV images

**Tasks:**
1. Implement SSTV decoder in `decode-service`
   - Audio input → SSTV decode (Martin 1 or Robot 36 mode)
   - Output: Image data as scan lines are decoded
2. Copy `team-dashboard-sdr/` to `team-dashboard-sstv/`
3. Build SSTV dashboard UI:
   - Canvas for progressive image rendering
   - Source image display
   - Decode status panel
   - Quality metrics
4. Connect via WebSocket to decode service
5. Test with `sstv-20m.iq` file
6. Verify jamming impact shows image corruption

**Deliverable:** Working SSTV dashboard showing decoded images, degrading under jamming

---

### Phase 3: AIS Decoder + Dashboard
**Goal:** Second decode dashboard showing ship tracking

**Tasks:**
1. Implement AIS decoder in `decode-service`
   - FM demod → GMSK demod → AIS packet decode
   - Output: JSON AIS messages (MMSI, position, name, etc.)
2. Copy `team-dashboard-sdr/` to `team-dashboard-ais/`
3. Build AIS dashboard UI:
   - Leaflet.js map integration
   - Ship markers with AIS data
   - Message log panel
   - Statistics display
4. Connect via WebSocket to decode service
5. Test with `ais-vhf.iq` file
6. Verify ships disappear when jammed

**Deliverable:** Working AIS map showing ships, losing tracking under jamming

---

### Phase 4: Metrics Analyzer + Dashboard
**Goal:** Third dashboard showing quantitative signal analysis

**Tasks:**
1. Implement metrics analyzer in `decode-service`
   - SNR calculation from IQ samples
   - Signal strength measurement
   - Error detection/counting
   - Spectral analysis
2. Copy `team-dashboard-sdr/` to `team-dashboard-metrics/`
3. Build metrics dashboard UI:
   - Real-time line charts (Chart.js or Recharts)
   - Gauge displays for current values
   - Alert indicators
   - Historical trending
4. Connect via WebSocket to decode service
5. Test with all IQ files
6. Verify metrics degrade under jamming

**Deliverable:** Working metrics dashboard showing quantitative jamming impact

---

### Phase 5: Integration & Deployment
**Goal:** All dashboards selectable from scenario page

**Tasks:**
1. Update client dashboard scenarios page to show all 4 teams
2. Add toggle/selection for which dashboards to deploy
3. Update orchestration to spawn selected dashboards
4. Create separate docker-compose profiles for different scenarios
5. Test full scenario deployment with all dashboards
6. Document usage in scenario README

**Deliverable:** Complete system where users can select which decode dashboards to enable

---

## Technical Considerations

### IQ Data Pipeline Options

**Option A: Tap SDR Service Stream**
- Decode service subscribes to IQ samples from SDR service
- Pro: Single source of truth, synchronized with jamming
- Con: Requires SDR service modification to publish IQ samples

**Option B: Independent IQ Reader**
- Decode service reads same IQ file independently
- Pro: No SDR service changes needed
- Con: Need to synchronize playback position and jamming state via MQTT

**Recommendation:** Start with Option B (easier), migrate to Option A if needed

### Real-Time Performance

- **SSTV**: Decodes in ~real-time (scan line by scan line)
- **AIS**: Very fast (packets decode in milliseconds)
- **Metrics**: Continuous analysis (update every 100ms or so)

### Jamming Impact Detection

All decoders will monitor jamming state via MQTT:
```python
# Subscribe to jamming status
mqtt.subscribe('apex/team/sdr-rf/status')

# When jamming enabled:
if jamming_enabled:
    # Decoders will see corrupted/failed decodes
    # Metrics will show SNR drop
    # Visual feedback in dashboards
```

---

## Libraries & Dependencies

### Decode Service
```
fastapi==0.104.1
uvicorn==0.24.0
websockets==12.0
numpy==1.26.0
scipy==1.11.3
pyais==2.6.0          # AIS decoding
Pillow==10.1.0        # Image handling
paho-mqtt==1.6.1      # MQTT client
```

### SSTV Decoder
- Custom implementation or adapt from open-source SSTV decoders
- Modes: Martin 1, Martin 2, Robot 36, Scottie 1

### AIS Decoder
- `pyais` library for NMEA/AIS decoding
- FM/GMSK demodulation from IQ samples

### Metrics Analyzer
- NumPy/SciPy for DSP operations
- FFT for spectral analysis
- Rolling window statistics

---

## Dashboard Technology Stack

All dashboards use:
- **React 18** + TypeScript
- **Vite** for build
- **TailwindCSS** for styling
- **Shared components** from existing dashboards
- **WebSocket** for real-time data
- **Docker** multi-stage builds (node → nginx)

### Dashboard-Specific Libraries

**SSTV Dashboard:**
- HTML5 Canvas for image rendering
- Custom scan-line renderer

**AIS Dashboard:**
- `react-leaflet` - Map integration
- `leaflet` - Map library
- OpenStreetMap tiles

**Metrics Dashboard:**
- `recharts` or `chart.js` - Real-time charts
- `react-gauge-component` - Gauge displays

---

## Testing Strategy

### Unit Testing
- Decode service: Test each decoder with known IQ samples
- Dashboards: Component testing with mock WebSocket data

### Integration Testing
1. Run decode service + dashboard in isolation
2. Feed test IQ file
3. Verify correct decoding without jamming
4. Enable jamming, verify degradation

### End-to-End Testing
1. Deploy full scenario with all dashboards
2. Load each IQ file type
3. Cycle through jamming types and power levels
4. Verify all dashboards show appropriate impact

---

## Success Criteria

### SSTV Dashboard
- ✅ Displays SSTV image line-by-line in real-time
- ✅ Shows clear image when no jamming
- ✅ Shows corrupted/noisy image when jammed
- ✅ Displays decode quality metrics
- ✅ Works with `sstv-20m.iq` file

### AIS Dashboard
- ✅ Shows ships on map with AIS data
- ✅ Updates positions in real-time
- ✅ Ships disappear/lose tracking when jammed
- ✅ Message log shows decode success/failures
- ✅ Works with `ais-vhf.iq` file

### Metrics Dashboard
- ✅ Displays real-time SNR, BER, signal strength
- ✅ Shows clear metrics degradation under jamming
- ✅ Graphs update smoothly (no lag)
- ✅ Alerts trigger at threshold levels
- ✅ Works with all IQ files

### Overall System
- ✅ All dashboards can run simultaneously
- ✅ Dashboards selectable from scenario page
- ✅ Synchronized with jamming control
- ✅ Clear visual demonstration of jamming impact
- ✅ No simulated data - all real decoding

---

## Timeline Estimate

**Phase 1:** Decode Service Foundation - 2-3 days
**Phase 2:** SSTV Decoder + Dashboard - 3-4 days
**Phase 3:** AIS Decoder + Dashboard - 3-4 days
**Phase 4:** Metrics Analyzer + Dashboard - 2-3 days
**Phase 5:** Integration & Deployment - 2-3 days

**Total:** 12-17 days of development

---

## Future Enhancements

### Short-term
- Support multiple SSTV modes (Martin 1, Robot 36, etc.)
- Add audio playback alongside decoding
- Save decoded images/data to files

### Medium-term
- LRIT weather satellite image decoding
- ACARS aircraft messaging decode
- APRS position reporting decode

### Long-term
- Multi-band simultaneous monitoring
- Recording and playback of decode sessions
- Machine learning for signal classification

---

## Questions to Resolve Before Starting

1. **IQ Data Access**: Should decode service tap SDR service stream or read files independently?
2. **WebSocket vs MQTT**: WebSocket for decode results, or push through MQTT?
3. **Dashboard Base**: Copy team-dashboard-sdr or create from template?
4. **Deployment Model**: All dashboards always running, or spawn on-demand?
5. **Port Allocation**: 3301, 3302, 3303 for new dashboards OK?

---

## Next Steps

1. Review this plan
2. Make architectural decisions on questions above
3. Create feature branch: `feature/decode-dashboards`
4. Start Phase 1: Decode service foundation
5. Iterate through phases with testing at each stage

---

**End of Plan Document**
