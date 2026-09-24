# Vitalsense

## Contactless Physiological Monitoring Using a Commodity RGB Camera

**Project Status:** Deployed Working Prototype / Active Development\
**Live Demo:** https://sairakeshsaguturu.github.io/vitalsense/\
**Source Code:** https://github.com/sairakeshsaguturu/vitalsense\
**Project Type:** Healthcare Technology / Computer Vision / Signal
Processing / Web Application

------------------------------------------------------------------------

## 1. Project Overview

Vitalsense is a software-based prototype that explores contactless
physiological monitoring using an ordinary RGB camera.

The project is designed around the idea that consumer devices such as
laptops and smartphones already contain cameras capable of capturing
subtle changes in facial appearance over time. These changes can contain
information related to blood-volume variations. Vitalsense processes
camera frames, identifies facial regions, extracts visual signals, and
applies remote photoplethysmography (rPPG) techniques to investigate
physiological measurements such as heart rate and respiratory rate.

The current prototype combines computer vision, digital signal
processing, facial landmark analysis, signal-quality assessment,
measurement sessions, and local measurement history in a browser-based
interface.

The project is experimental and is not intended to replace clinically
validated medical equipment, diagnosis, emergency monitoring, or
professional medical advice.

------------------------------------------------------------------------

## 2. Problem Statement

People may sometimes be advised to observe physiological parameters at
home between healthcare consultations. Maintaining such observations can
be inconvenient when dedicated monitoring hardware is unavailable or
when measurements have to be recorded manually.

A software-based camera interface could potentially reduce some of this
practical friction by allowing preliminary physiological observations
through hardware that many users already possess.

However, extracting physiological information from an ordinary RGB
camera is technically difficult. Facial motion, illumination changes,
automatic exposure, automatic white balance, camera characteristics,
background interference, and other sources of noise can overwhelm the
small physiological signal.

Vitalsense explores this problem through a quality-aware contactless
monitoring workflow.

------------------------------------------------------------------------

## 3. Proposed Solution

Vitalsense uses a camera-based pipeline consisting of:

1.  Camera acquisition
2.  Face detection and tracking
3.  Facial landmark analysis
4.  Facial skin-region selection
5.  Spatial signal extraction
6.  RGB temporal signal processing
7.  rPPG estimation
8.  Multiple algorithm comparison
9.  Signal-quality assessment
10. Heart-rate estimation
11. Respiratory-rate estimation
12. Measurement session management
13. Measurement history
14. Validation support
15. Developer diagnostics

The system is designed to avoid treating every camera-derived number as
trustworthy. When the captured signal does not meet the required quality
conditions, the application can reject the measurement instead of
presenting an unreliable value as a valid result.

------------------------------------------------------------------------

## 4. Core Concept

The central processing idea is:

``` text
RGB Camera
    |
    v
Face Detection / Tracking
    |
    v
Facial Landmarks
    |
    v
Facial Skin Regions
    |
    v
Spatial RGB Signal Extraction
    |
    +------------------+
    |                  |
    v                  v
 Green Channel       CHROM
    |                  |
    +--------+---------+
             |
             v
            POS
             |
             v
      Signal Processing
             |
             v
      Spectral Analysis
             |
             v
      Quality Assessment
             |
             v
     Algorithm Consensus
             |
             v
       HR / RR Estimate
             |
             v
       Measurement History
```

------------------------------------------------------------------------

## 5. Main Features

### 5.1 Camera Input

The application can access a compatible RGB camera through browser
camera APIs.

The interface displays the live camera feed and provides camera status
information.

### 5.2 Face Tracking

The prototype uses facial landmark tracking to locate and follow the
user's face.

This provides the geometric information required to select facial
regions for signal extraction.

### 5.3 Facial Skin-Patch Processing

Instead of treating the complete face as a single signal, Vitalsense can
divide suitable facial skin areas into multiple regions or patches.

Candidate areas include:

-   Forehead
-   Upper cheeks
-   Middle cheeks
-   Lateral cheek areas

Regions around areas such as eyes, eyebrows, nostrils, lips, hair, and
facial boundaries are excluded where possible because they can introduce
unwanted motion or visual contamination.

### 5.4 Green-Channel rPPG

The green color channel is used as one of the baseline remote
photoplethysmography signals.

The temporal signal is processed to investigate periodic variations
associated with changes in facial blood volume.

### 5.5 CHROM

Vitalsense includes a CHROM-based chrominance approach for rPPG
estimation.

The method uses relationships between color channels to reduce some
common illumination-related effects.

### 5.6 POS

The prototype also implements the Plane-Orthogonal-to-Skin approach
(POS) for rPPG signal extraction.

Using multiple methods provides a way to compare independently derived
estimates rather than relying on a single algorithm.

### 5.7 Signal Processing

The processing pipeline includes operations such as:

-   Temporal normalization
-   Detrending
-   Band-pass filtering
-   Spectral analysis
-   Peak detection
-   Power estimation
-   Signal-to-noise assessment
-   Frequency-to-BPM conversion

The implementation is designed to operate on a moving camera-signal
buffer.

### 5.8 Algorithm Consensus

The application compares estimates from multiple rPPG methods.

Agreement between methods is treated separately from signal trust. Two
algorithms producing similar numbers does not automatically mean the
result is valid if the underlying signal quality is poor.

### 5.9 Signal Quality Assessment

Signal quality is a major component of Vitalsense.

The application considers factors such as:

-   Signal strength
-   Spectral concentration
-   SNR
-   Motion
-   Lighting
-   Exposure
-   Patch quality
-   Signal continuity
-   Algorithm agreement

When the quality requirements are not met, the application can display
an invalid or insufficient-signal state.

### 5.10 Respiratory Rate

The prototype includes an experimental respiratory-rate estimation
pathway based on camera-derived temporal information.

Respiratory-rate output is treated as an estimate and requires further
real-world validation before any clinical interpretation.

### 5.11 Measurement History

The interface provides a history area for measurements and trends.

The intended purpose is to help users maintain a structured record
rather than manually writing down individual observations.

### 5.12 Validation Interface

The project includes a validation interface where reference measurements
can be entered for comparison with Vitalsense estimates.

This is intended as an experimental evaluation mechanism rather than
proof of clinical accuracy.

### 5.13 Developer Debugging

Vitalsense contains a detailed diagnostic panel for development.

The diagnostic interface can expose information such as:

-   Camera frame rate
-   Buffer duration
-   Frequency resolution
-   Per-method BPM
-   Spectral peaks
-   Signal quality
-   SNR
-   ROI or patch information
-   Patch rejection reasons
-   Patch contribution
-   Consensus information
-   Signal plots
-   Spectral plots
-   Multi-scale comparisons
-   Comparison between older regional processing and dense patch
    processing

This diagnostic system is useful because rPPG failures can originate at
several different stages of the pipeline.

------------------------------------------------------------------------

## 6. Technology Stack

### Frontend

-   HTML
-   CSS
-   JavaScript
-   Browser Camera APIs

### Computer Vision

-   MediaPipe facial landmark/face tracking technology

### Signal Processing

-   JavaScript-based digital signal processing
-   Temporal signal processing
-   Band-pass filtering
-   Spectral analysis
-   FFT/Welch-style analysis
-   Peak detection

### rPPG Methods

-   Green-channel baseline
-   CHROM
-   POS

### Storage

The application architecture supports browser-side measurement history
and local storage mechanisms where implemented.

### Testing

-   Node.js
-   Unit-level signal tests
-   Geometry tests
-   Integration tests
-   Synthetic signal testing

------------------------------------------------------------------------

## 7. Project Structure

A typical project directory contains:

``` text
Vitalsense/
│
├── index.html
├── dsp.js
├── test.js
├── geom.test.js
├── integration.test.js
├── README.md
└── assets/
```

The exact files may vary depending on the current development version.

### `index.html`

Contains the browser application interface, camera interface, facial
processing integration, visualization, measurement interface, and
application logic.

### `dsp.js`

Contains signal-processing and rPPG-related functionality.

### `test.js`

Contains automated tests for signal-processing functionality and related
components.

### `geom.test.js`

Contains tests related to facial patch geometry and spatial processing.

### `integration.test.js`

Contains integration-level tests for the measurement pipeline and
session behavior.

### `README.md`

Contains project information, setup instructions, testing instructions,
limitations, and development status.

------------------------------------------------------------------------

------------------------------------------------------------------------

## 8. Live Deployment

Vitalsense is now deployed as a public web application using GitHub
Pages.

**Live Demo:**

``` text
https://sairakeshsaguturu.github.io/vitalsense/
```

**Source Repository:**

``` text
https://github.com/sairakeshsaguturu/vitalsense
```

The deployed application is served over HTTPS, which allows the browser
to request camera access in a secure context.

The deployment is intended to demonstrate the current working prototype.
Because the project uses real-time camera processing and external browser
libraries, behavior can vary depending on the browser, camera hardware,
lighting conditions, device performance, and network availability.

------------------------------------------------------------------------

## 9. How to Run

### Requirement

A modern browser such as:

-   Google Chrome
-   Microsoft Edge
-   Another modern browser with camera support

A compatible webcam is required for camera-based operation.

### Start a Local Server

Open Terminal in the Vitalsense project directory and run:

``` bash
python3 -m http.server 8000
```

Then open:

``` text
http://localhost:8000
```

Allow camera access when the browser requests permission.

### Why Use a Local Server?

Running through a local HTTP server provides a predictable browser
environment for camera access and local project resources.

------------------------------------------------------------------------

## 10. How to Run the Tests

From the project directory:

``` bash
node test.js
```

Run the geometry tests:

``` bash
node geom.test.js
```

Run the integration tests:

``` bash
node integration.test.js
```

The tests are intended to verify software behavior and signal-processing
logic. Passing synthetic or integration tests does not establish
clinical accuracy.

------------------------------------------------------------------------

## 11. Measurement Workflow

The intended workflow is:

``` text
Start Application
       |
       v
Allow Camera
       |
       v
Detect Face
       |
       v
Track Facial Landmarks
       |
       v
Select Facial Skin Regions
       |
       v
Collect Camera Signal
       |
       v
Build Signal Buffer
       |
       v
Process rPPG
       |
       v
Evaluate Signal Quality
       |
       +---- Poor ----> Invalid / Insufficient Signal
       |
       v
Compare Algorithms
       |
       v
Estimate HR / RR
       |
       v
Complete Measurement
       |
       v
Store Measurement
```

------------------------------------------------------------------------

## 12. Quality-Aware Design

A major design principle of Vitalsense is that the system should not be
forced to produce a physiological value when the captured signal is
unreliable.

For example:

``` text
Strong signal + agreement + acceptable quality
                |
                v
          Candidate result

Weak signal
     |
     v
Measurement rejected
```

This approach is intentional.

A numerical output is not automatically a trustworthy output.

------------------------------------------------------------------------

## 13. DEMO / SIMULATED MODE

The working prototype may contain a clearly identified demonstration
mode.

When DEMO MODE is active, displayed physiological values are simulated
for demonstrating the user interface and measurement workflow.

Typical demonstration values may include:

-   Heart rate within a normal demonstration range
-   Respiratory rate within a normal demonstration range
-   Simulated signal-quality percentage
-   Animated simulated pulse waveform
-   Measurement progress
-   Demo measurement history

All such results must remain visibly identified as:

``` text
DEMO / SIMULATED
```

These values are not measurements obtained from the user's physiology.

They must not be interpreted as medical measurements.

The demonstration mode exists so that the complete product workflow can
be evaluated while the real rPPG pipeline continues to undergo
development and validation.

------------------------------------------------------------------------

## 14. Testing Strategy

The project uses multiple levels of testing.

### Synthetic Signal Testing

Synthetic signals can be used to verify whether the signal-processing
algorithms respond correctly to controlled inputs.

This is useful for detecting software errors without requiring a real
camera.

### Geometry Testing

Facial patch geometry can be tested using controlled/fabricated landmark
configurations.

This helps verify that regions are created and excluded according to the
intended geometry.

### Integration Testing

Integration tests exercise multiple components together, including
buffering, processing, quality handling, and measurement-session
behavior.

### Real Camera Testing

Real camera testing is different from synthetic testing.

Real-world performance can be affected by:

-   Lighting
-   Camera exposure
-   White balance
-   Frame timing
-   Face movement
-   Skin appearance
-   Camera hardware
-   Background illumination
-   Browser performance

Therefore, software tests alone cannot establish real-world measurement
accuracy.

------------------------------------------------------------------------

## 15. Privacy Considerations

Vitalsense is designed as a browser-based prototype.

Camera access is requested through the browser's camera permission
mechanism.

The project should avoid unnecessary storage or transmission of raw
camera frames.

Where possible, processing can be performed locally in the browser.

Users should understand what information is stored by their browser and
should not use experimental software as a substitute for appropriate
medical monitoring.

------------------------------------------------------------------------

## 16. Limitations

The current project is an experimental prototype.

Important limitations include:

1.  Real-camera rPPG performance can vary substantially between devices
    and environments.

2.  Camera exposure and white-balance systems can introduce unwanted
    signal variations.

3.  Head movement can contaminate the physiological signal.

4.  Facial illumination must be sufficiently stable for reliable signal
    extraction.

5.  Different cameras can have different frame timing and
    image-processing characteristics.

6.  Respiratory-rate estimation requires further validation.

7.  The prototype has not been established as a clinically validated
    medical device.

8.  Synthetic tests cannot replace real physiological validation.

9.  Agreement between algorithms does not by itself prove physiological
    correctness.

10. A reference-device study is required to properly quantify real-world
    accuracy.

------------------------------------------------------------------------

## 17. Safety and Medical Disclaimer

Vitalsense is an experimental software prototype.

It is:

-   Not a certified medical device
-   Not intended for diagnosis
-   Not intended for emergency decisions
-   Not a replacement for clinical equipment
-   Not a replacement for professional medical consultation

Any physiological values shown by the demonstration mode are simulated
and must not be interpreted as actual measurements.

For medical decisions, users should rely on appropriately validated
medical devices and qualified healthcare professionals.

------------------------------------------------------------------------

## 18. Future Development

The project is actively being developed.

Planned development areas include:

-   Improved real-camera rPPG robustness
-   Better facial skin-region selection
-   Adaptive patch quality estimation
-   Improved illumination handling
-   Better motion compensation
-   Camera-specific calibration
-   More robust respiratory-rate estimation
-   Larger real-world validation datasets
-   Reference-device comparison
-   Statistical error analysis
-   Improved measurement stability
-   Cross-device testing
-   Performance optimization
-   More extensive privacy controls
-   Improved accessibility
-   Deployment optimization

Future versions will focus on improving the real physiological signal
extraction rather than simply relaxing quality requirements.

------------------------------------------------------------------------

## 19. Development Philosophy

The project follows an important principle:

> A system should be able to say that it does not have enough reliable
> information.

For Vitalsense, this means an invalid measurement can be more
appropriate than an unsupported numerical result.

The goal is therefore not simply to make a camera display a heart-rate
number. The goal is to build a signal-processing system that can
determine when a camera-derived physiological estimate has sufficient
evidence to be considered a candidate measurement.

------------------------------------------------------------------------

## 20. Current Submission Status

The submitted version is a deployed working prototype intended to demonstrate the
project's concept, user interface, camera workflow, computer-vision
pipeline, signal-processing architecture, diagnostics, and planned
measurement experience. The current prototype is publicly accessible through the
GitHub Pages deployment linked above.

The underlying real-time physiological monitoring pipeline is still
under active development and requires additional real-camera testing and
validation.

The submission should therefore be understood as a prototype
demonstration rather than a finished clinical monitoring product.

------------------------------------------------------------------------

## 21. Originality Statement

This README and the project description have been written specifically
for the Vitalsense project and are intended to describe its
architecture, implementation approach, limitations, and development
status in original wording.

No claim of clinical validation or production-level medical accuracy is
made without corresponding evidence.

------------------------------------------------------------------------

## 22. Final Note

**My project is currently under active development. That is why I am
submitting a working demonstration version at this stage. Vitalsense is
a technically complex project involving computer vision, real-time
signal processing, facial landmark analysis, rPPG algorithms,
signal-quality assessment, and browser-based camera processing. I need
additional development and testing time to further improve and validate
the real-time implementation. The submitted version demonstrates the
working concept and current implementation while development
continues.**
