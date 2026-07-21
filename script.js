// momaPatterns
// by francesca rodriguez-sawaya
// july 2026
// v2.0.0

// variables for debugging
let isConsoleOn = false;

// audio variables
//  mic input with p5.js
let mic;
// loudness value
let rms;
// audio analyzer for amplitude value
let audioAnalyzer;
// mininum volume threshold
let minVolume = 0.02;

// pitch / intonation variables
// ml5.js pitch detection object (runs a small ML model, CREPE)
let pitchDetector;
// most recent detected pitch, in Hz. null until we get a first reading
let currentFreq = null;
// is the pitch model loaded and ready to use
let isPitchReady = false;
// path to the hosted pitch-detection model ml5 needs
const pitchModelPath = "https://cdn.jsdelivr.net/gh/ml5js/ml5-data-and-models/models/pitch-detection/crepe/";
// typical speaking voice range, used to map Hz -> color
// (low male voice ~85Hz up to a high excited voice ~400Hz; adjust to taste)
let minFreq = 85;
let maxFreq = 400;

// pace / rhythm variables
// pace and rhythm are both derived from "onsets" — the moment
// speech starts after a pause. We track when those happen and
// use the timing between them, without looking at words at all.

// was the previous frame "speaking"? used to detect the silence->voice moment
let wasSpeaking = false;
// timestamps (ms, from millis()) of the last several onsets
let onsetTimestamps = [];
// how many onsets to keep in the rolling window
let maxOnsetsTracked = 8;
// current estimated pace, in onsets per second. null until we have enough data
let currentPace = null;
// current estimated rhythm irregularity: coefficient of variation of the
// gaps between onsets. 0 = perfectly steady, higher = more erratic
let currentRhythmVariability = null;

// pace range used to map onset rate -> corner roundness (tune to taste)
let minPace = 0.15; // slow, sparse bursts of speech
let maxPace = 1.2;  // fast, rapid-fire bursts
// resulting corner-radius range, in pixels. Fast pace = sharp corners
// (urgent, tight). Slow, sparse pace = very round corners, almost
// circular — visually reads as "space" or give in the delivery.
let minPaceRadius = 2;   // fast pace: nearly square corners
let maxPaceRadius = 12;  // slow pace: half of baseSize, fully rounded

// rhythm is now drawn as a thread connecting consecutive voice squares,
// rather than moving the squares themselves. Steady rhythm -> a nearly
// straight line. Erratic rhythm -> a sharp zigzag kink in each segment.
// max sideways deviation of the kink, in pixels
let maxThreadDeviationPixels = 20;
// remembers the center of the last voice square drawn, so we know
// where to start the next thread segment from. null = no prior square yet
let prevVoiceCenterX = null;
let prevVoiceCenterY = null;

// drawing variables
// current position for drawing
// let currentPos = 0;
let currentX = 0;
let currentY = 0;
// are we drawing or not, by default it is false
let isDrawing = false;
// width of squares being drawn
let squareWidth = 0;
// how many squares in X dimension
let numberSquaresX = 15;
// percentage of how big the square is
let percentageWidth = 0.9;
// rounded corner radius of squares\
let squareRadius = 7;

// user interface variables
let buttonStart = document.getElementById("buttonStart");
let buttonClear = document.getElementById("buttonClear");

// checkboxes that make each added layer optional
let toggleColor = document.getElementById("toggleColor");
let togglePace = document.getElementById("togglePace");
let toggleRhythm = document.getElementById("toggleRhythm");

// live text readout of the underlying pace/rhythm numbers, for testing/tuning
let debugReadout = document.getElementById("debugReadout");

// current on/off state for each optional layer, read from the checkboxes.
// pause vs. voice (black vs. not-black) is the one layer that's always on —
// everything else here is an optional addition on top of it
let isColorEnabled = toggleColor.checked;
let isPaceEnabled = togglePace.checked;
let isRhythmEnabled = toggleRhythm.checked;

// add event listeners to buttons
buttonStart.addEventListener("click", pressedStart);
buttonClear.addEventListener("click", pressedClear);

// add event listeners to checkboxes, so toggling one updates its state immediately
toggleColor.addEventListener("change", function () {
  isColorEnabled = toggleColor.checked;
});
togglePace.addEventListener("change", function () {
  isPaceEnabled = togglePace.checked;
});
toggleRhythm.addEventListener("change", function () {
  isRhythmEnabled = toggleRhythm.checked;
});

// setup() function happens once, at the beginning
// triggered by p5.js
function setup() {

  // canvas size
  createCanvas(400, 500);

  // update squareWidth
  // we want 15 squares wide
  squareWidth = width / numberSquaresX;

  // adapt to pixel density of screen
  pixelDensity(1);

  // draw with no stroke
  noStroke();

  // use hue/saturation/brightness so we can map pitch (Hz) to hue directly
  colorMode(HSB, 360, 100, 100);

  // adjust framerate to 10 frames per second
  // this affects how often draw() is executed
  frameRate(10);

  // initialize mic input
  mic = new p5.AudioIn();

  // initialize audio analyzer of amplitude
  audioAnalyzer = new p5.Amplitude();
  // make analyzer measure loudness of mic
  audioAnalyzer.setInput(mic);

  // turn on mic, then start pitch detection once the mic stream is ready
  mic.start(startPitchDetection);

  // start audio context
  touchStarted();
}

// called once the mic has actually started and has a live stream
function startPitchDetection() {
  pitchDetector = ml5.pitchDetection(
    pitchModelPath,
    getAudioContext(),
    mic.stream,
    modelLoaded
  );
}

// called once when the CREPE model finishes loading
function modelLoaded() {
  isPitchReady = true;
  if (isConsoleOn) {
    console.log("pitch model loaded");
  }
  // kick off the first pitch reading; getPitch() re-triggers itself
  getPitch();
}

// callback-based loop: ml5 gives us one frequency reading,
// we store it, then immediately ask for the next one
function getPitch() {
  pitchDetector.getPitch(function (err, frequency) {
    if (err) {
      if (isConsoleOn) {
        console.log(err);
      }
    } else if (frequency) {
      currentFreq = frequency;
      if (isConsoleOn) {
        console.log("pitch (Hz): " + frequency);
      }
    }
    // ask for the next reading, keep the loop going
    getPitch();
  });
}

// tones of white: a faint, cool hue with very low, fixed saturation,
// so it reads as "white" rather than a visible color
let baseHue = 200;
let baseSaturation = 5;
// the actual sweep happens on brightness: crisp white (low pitch)
// down to a soft cool-grey (high pitch) — kept in a narrower band
// for a subtler effect, still nowhere near black
let minVoiceBrightness = 78;
let maxVoiceBrightness = 99;

// maps a frequency in Hz to a brightness value, based on minFreq/maxFreq
// range — this drives the white-to-grey sweep. Higher pitch = darker/greyer.
function freqToBrightness(freq) {
  let clampedFreq = constrain(freq, minFreq, maxFreq);
  return map(clampedFreq, minFreq, maxFreq, maxVoiceBrightness, minVoiceBrightness);
}

// called every time speech starts right after a pause — an "onset".
// this is where pace and rhythm actually get measured, using only timing,
// never the words themselves
function registerOnset() {
  let now = millis();
  onsetTimestamps.push(now);
  // keep only the most recent onsets, so pace/rhythm reflect recent
  // speech rather than the whole recording
  if (onsetTimestamps.length > maxOnsetsTracked) {
    onsetTimestamps.shift();
  }

  // pace needs just 2 onsets (1 interval) to give a first reading —
  // deliberately fast to react, since the canvas is small and a short
  // demo shouldn't require several pauses before anything shows up
  if (onsetTimestamps.length < 2) {
    return;
  }

  // gaps between consecutive onsets, in seconds
  let intervals = [];
  for (let i = 1; i < onsetTimestamps.length; i++) {
    intervals.push((onsetTimestamps[i] - onsetTimestamps[i - 1]) / 1000);
  }

  // pace: how often bursts of speech are starting
  let meanInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  currentPace = 1 / meanInterval;

  // rhythm variability genuinely needs at least 2 intervals (3 onsets) —
  // you can't measure how consistent gaps are with only one gap to look at
  if (intervals.length >= 2) {
    let variance = intervals.reduce((sum, val) => sum + Math.pow(val - meanInterval, 2), 0) / intervals.length;
    let stdDev = Math.sqrt(variance);
    currentRhythmVariability = stdDev / meanInterval;
  }

  if (isConsoleOn) {
    console.log("pace (onsets/sec): " + currentPace + " | rhythm variability: " + currentRhythmVariability);
  }
}

// maps current pace to a corner-radius value, in pixels
function paceToRadius() {
  if (currentPace === null) {
    return squareRadius; // no data yet: fall back to the default pause-square roundness
  }
  let clampedPace = constrain(currentPace, minPace, maxPace);
  // note the direction: fast pace -> small radius (sharp), slow pace -> large radius (round)
  return map(clampedPace, minPace, maxPace, maxPaceRadius, minPaceRadius);
}

// maps current rhythm variability to how far the thread's kink deviates, in pixels
function rhythmToThreadDeviation() {
  if (currentRhythmVariability === null) {
    return 0;
  }
  // cap variability at 1.0 before mapping, so one erratic outlier
  // doesn't send the kink off the scale
  let clampedVariability = constrain(currentRhythmVariability, 0, 1);
  return map(clampedVariability, 0, 1, 0, maxThreadDeviationPixels);
}

// draw() is executed on a loop, after setup()
// draw() is executed by p5.js
function draw() {

  // update current mic loudness value
  rms = mic.getLevel();

  // compute this every frame so the debug readout below stays live
  // even between bursts of speech
  let currentRadiusValue = paceToRadius();
  let currentDeviationValue = rhythmToThreadDeviation();

  // live readout of the actual numbers driving pace/rhythm, so you can
  // confirm what's happening without opening the browser console
  if (debugReadout) {
    debugReadout.textContent =
      "pace: " + (currentPace !== null ? nf(currentPace, 1, 2) + " bursts/sec" : "—") +
      "   corner radius: " + nf(currentRadiusValue, 1, 1) + "px" +
      "   rhythm variability: " + (currentRhythmVariability !== null ? nf(currentRhythmVariability, 1, 2) : "—") +
      "   thread kink: " + nf(currentDeviationValue, 1, 1) + "px";
  }

  if (isDrawing) {

    if (isConsoleOn) {
      console.log("rms:" + rms);
    }

    // is there voice right now, this frame?
    let isSpeaking = rms >= minVolume;

    // onset = the exact moment we go from pause to voice.
    // this is the only thing pace/rhythm are measured from.
    if (isSpeaking && !wasSpeaking) {
      registerOnset();
    }
    wasSpeaking = isSpeaking;

    // update currentPos
    // check if volume is less than minVolume
    if (!isSpeaking) {

      if (isConsoleOn) {
        console.log("pause - black");
      }

      // paint the pixel black (hue doesn't matter, brightness 0)
      // pauses stay plain — no pace/rhythm distortion, so they read
      // as a clean, calm baseline against the more active voice squares.
      // note: we deliberately don't touch prevVoiceCenter here, so the
      // rhythm thread will "leap" across this pause once voice resumes.
      fill(color(0, 0, 0));
      square(currentX, currentY, squareWidth*percentageWidth, squareRadius);
    }
    else {

      // there's voice: sweep brightness from white (low pitch)
      // to warm grey (high pitch), keeping hue/saturation nearly flat
      // only applies if the pitch checkbox is on; otherwise plain white
      let brightness = (isColorEnabled && currentFreq && isPitchReady) ? freqToBrightness(currentFreq) : maxVoiceBrightness;

      // pace controls corner roundness — sharp for fast, round for slow —
      // only if the pace checkbox is on; otherwise default roundness
      let cornerRadius = isPaceEnabled ? currentRadiusValue : squareRadius;

      let baseSize = squareWidth * percentageWidth;

      if (isConsoleOn) {
        console.log("voice - brightness:" + brightness + " cornerRadius:" + cornerRadius);
      }

      // paint the pixel with a color mapped from the current pitch,
      // and rounded by how sparse/rapid the current pace is
      fill(color(baseHue, baseSaturation, brightness));
      square(currentX, currentY, baseSize, cornerRadius);

      // this square's center, used both to anchor the rhythm thread
      // and to remember where the next segment should start from
      let centerX = currentX + baseSize / 2;
      let centerY = currentY + baseSize / 2;

      // rhythm: draw a thread from the last voice square to this one,
      // with a sideways kink sized by how erratic the timing has been.
      // steady rhythm -> nearly straight. erratic rhythm -> a sharp zigzag.
      if (isRhythmEnabled && prevVoiceCenterX !== null) {
        let midX = (prevVoiceCenterX + centerX) / 2;
        let midY = (prevVoiceCenterY + centerY) / 2;

        // perpendicular direction to the segment, so the kink pushes
        // sideways rather than along the line itself
        let dx = centerX - prevVoiceCenterX;
        let dy = centerY - prevVoiceCenterY;
        let length = sqrt(dx * dx + dy * dy);
        let perpX = length > 0 ? -dy / length : 0;
        let perpY = length > 0 ? dx / length : 0;

        // randomize which side the kink falls on, so a steady erratic
        // rhythm zigzags rather than bowing consistently one way
        let side = random() < 0.5 ? -1 : 1;
        let kinkX = midX + perpX * currentDeviationValue * side;
        let kinkY = midY + perpY * currentDeviationValue * side;

        push();
        noFill();
        stroke(0, 0, 40); // neutral mid-grey thread, distinct from black pauses and white/grey squares
        strokeWeight(1.5);
        beginShape();
        vertex(prevVoiceCenterX, prevVoiceCenterY);
        vertex(kinkX, kinkY);
        vertex(centerX, centerY);
        endShape();
        pop();
      }

      // remember this square's center for the next thread segment
      prevVoiceCenterX = centerX;
      prevVoiceCenterY = centerY;

    }

    // update next drawing position in X axis
    currentX = currentX + squareWidth;
    // if we are trying to draw outside of canvas in X
    if (currentX > width) {
      // reset X
      currentX = 0;
      // go to next line in Y
      currentY = currentY + squareWidth;
    }

    // wraparound, when we reach the end, go back to beginning
    if (currentY > height) {
      currentX = 0;
      currentY = 0;
      isDrawing = false;
    }

  }

  // TODO: check if this is neccessary / and what it is for
  getAudioContext().state !== 'running'

}

// TODO: check if works on mobile
function touchStarted() {
  if (getAudioContext().state !== 'running') {
    getAudioContext().resume();
  }
  let synth = new p5.MonoSynth();
  synth.play('A4', 0.5, 0, 0.2);
}

// keyPressed() is triggered when a key is pressed
// current key pressed is on global variable 'key'
// this is a p5.js function
function keyPressed() {
  // check if x was pressed
  if (key == "x") {
    // toggle console.log on and off, for debugging
    isConsoleOn = !isConsoleOn;
  }
}

// function trigggered when pressing button start/stop
function pressedStart(){
  // toggle drawing on/off
  isDrawing = !isDrawing;
}

// function trigggered when pressing button clear
function pressedClear(){
  // stop drawing
  isDrawing = false;
  // reset drawing position
  currentX = 0;
  currentY = 0;
  // reset pace/rhythm tracking so a new take starts with a clean slate
  onsetTimestamps = [];
  currentPace = null;
  currentRhythmVariability = null;
  wasSpeaking = false;
  // reset the rhythm thread too, so it doesn't leap from the old take
  prevVoiceCenterX = null;
  prevVoiceCenterY = null;
  // clear canvas and make it white (hue 0, saturation 0, full brightness)
  background(0, 0, 100);
}
