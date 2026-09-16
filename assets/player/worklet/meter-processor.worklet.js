"use strict";

// src/worklet/meter-processor.worklet.ts
var MeterProcessor = class extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { numberOfChannels, updateRate } = options?.processorOptions ?? {};
    this.numberOfChannels = typeof numberOfChannels === "number" && Number.isFinite(numberOfChannels) ? Math.max(1, Math.floor(numberOfChannels)) : 1;
    const rate = typeof updateRate === "number" && Number.isFinite(updateRate) && updateRate > 0 ? updateRate : 60;
    this.blocksPerUpdate = Math.max(1, Math.floor(sampleRate / (128 * rate)));
    this.blocksProcessed = 0;
    this.maxPeak = new Float32Array(this.numberOfChannels);
    this.sumSquares = new Float64Array(this.numberOfChannels);
    this.sampleCount = new Uint32Array(this.numberOfChannels);
    this.levels = new Float32Array(2 * this.numberOfChannels);
  }
  process(inputs, outputs, _parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) {
      for (let ch = 0; ch < this.numberOfChannels; ch++) {
        this.sampleCount[ch] += 128;
      }
      this.blocksProcessed++;
      this.flushIfDue();
      return true;
    }
    for (let ch = 0; ch < output.length; ch++) {
      const inputChannel = input[ch];
      const outputChannel = output[ch];
      if (inputChannel && outputChannel) {
        outputChannel.set(inputChannel);
      }
    }
    for (let ch = 0; ch < this.numberOfChannels; ch++) {
      const inputChannel = input[ch];
      if (!inputChannel) continue;
      let peak = this.maxPeak[ch];
      let sum = this.sumSquares[ch];
      for (let i = 0; i < inputChannel.length; i++) {
        const sample = inputChannel[i];
        const abs = Math.abs(sample);
        if (abs > peak) peak = abs;
        sum += sample * sample;
      }
      this.maxPeak[ch] = peak;
      this.sumSquares[ch] = sum;
      this.sampleCount[ch] += inputChannel.length;
    }
    this.blocksProcessed++;
    this.flushIfDue();
    return true;
  }
  flushIfDue() {
    if (this.blocksProcessed < this.blocksPerUpdate) return;
    for (let ch = 0; ch < this.numberOfChannels; ch++) {
      this.levels[ch] = this.maxPeak[ch];
      const count = this.sampleCount[ch];
      this.levels[this.numberOfChannels + ch] = count > 0 ? Math.sqrt(this.sumSquares[ch] / count) : 0;
    }
    this.port.postMessage(this.levels);
    this.maxPeak.fill(0);
    this.sumSquares.fill(0);
    this.sampleCount.fill(0);
    this.blocksProcessed = 0;
  }
};
registerProcessor("meter-processor", MeterProcessor);
//# sourceMappingURL=meter-processor.worklet.js.map