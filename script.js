// momaPatterns
// by francesca rodriguez-sawaya
// july 2026
// v1.0.0

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

// add event listeners to buttons
buttonStart.addEventListener("click", pressedStart);
buttonClear.addEventListener("click", pressedClear);

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

// maps a frequency in Hz to a hue (0-360) based on minFreq/maxFreq range
function freqToHue(freq) {
  let clampedFreq = constrain(freq, minFreq, maxFreq);
  return map(clampedFreq, minFreq, maxFreq, 0, 360);
}

// draw() is executed on a loop, after setup()
// draw() is executed by p5.js
function draw() {

  // update current mic loudness value
  rms = mic.getLevel();

  if (isDrawing) {

    if (isConsoleOn) {
      console.log("rms:" + rms);
    }

    // update currentPos
    // check if volume is less than minVolume
    if (rms < minVolume) {

      if (isConsoleOn) {
        console.log("pause - black");
      }

      // paint the pixel black (hue doesn't matter, brightness 0)
      fill(color(0, 0, 0));
      square(currentX, currentY, squareWidth*percentageWidth, squareRadius);
    }
    else {

      // there's voice: color the square by pitch instead of plain white
      // if we don't have a pitch reading yet, fall back to white
      let hue = (currentFreq && isPitchReady) ? freqToHue(currentFreq) : 0;
      let saturation = (currentFreq && isPitchReady) ? 80 : 0;

      if (isConsoleOn) {
        console.log("voice - hue:" + hue);
      }

      // paint the pixel with a color mapped from the current pitch
      fill(color(hue, saturation, 100));
      square(currentX, currentY, squareWidth*percentageWidth, squareRadius);

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
  // clear canvas and make it white (hue 0, saturation 0, full brightness)
  background(0, 0, 100);
}
