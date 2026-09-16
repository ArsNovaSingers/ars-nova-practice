"use strict";

// src/worklet/recording-processor.worklet.ts
var RecordingProcessor = class extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 0;
    this.buffers = [];
    this.samplesCollected = 0;
    this.isRecording = false;
    this.channelCount = 1;
    this.port.onmessage = (event) => {
      const { command, channelCount } = event.data;
      if (command === "start") {
        this.isRecording = true;
        this.channelCount = channelCount || 1;
        this.bufferSize = Math.floor(sampleRate * 0.016);
        this.buffers = [];
        for (let i = 0; i < this.channelCount; i++) {
          this.buffers[i] = new Float32Array(this.bufferSize);
        }
        this.samplesCollected = 0;
      } else if (command === "pause") {
        this.isRecording = false;
        if (this.samplesCollected > 0) {
          this.flushBuffers();
        }
      } else if (command === "resume") {
        this.isRecording = true;
      } else if (command === "stop") {
        this.isRecording = false;
        this.flushBuffers(true);
        this.buffers = [];
        this.bufferSize = 0;
      }
    };
  }
  process(inputs, _outputs, _parameters) {
    if (!this.isRecording) {
      return true;
    }
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }
    const frameCount = input[0].length;
    if (this.bufferSize <= 0) {
      return true;
    }
    let offset = 0;
    while (offset < frameCount) {
      const remaining = this.bufferSize - this.samplesCollected;
      const toCopy = Math.min(remaining, frameCount - offset);
      for (let channel = 0; channel < Math.min(input.length, this.channelCount); channel++) {
        const inputChannel = input[channel];
        const buffer = this.buffers[channel];
        for (let i = 0; i < toCopy; i++) {
          buffer[this.samplesCollected + i] = inputChannel[offset + i];
        }
      }
      this.samplesCollected += toCopy;
      offset += toCopy;
      if (this.samplesCollected >= this.bufferSize) {
        this.flushBuffers();
      }
    }
    return true;
  }
  flushBuffers(final = false) {
    const channels = [];
    const transfer = [];
    for (let i = 0; i < this.channelCount; i++) {
      const buf = this.buffers[i];
      if (!buf) continue;
      channels.push(buf.subarray(0, this.samplesCollected));
      transfer.push(buf.buffer);
    }
    const message = {
      channels,
      channelCount: this.channelCount
    };
    if (final) message.done = true;
    this.port.postMessage(message, transfer);
    if (!final) {
      for (let i = 0; i < this.channelCount; i++) {
        this.buffers[i] = new Float32Array(this.bufferSize);
      }
    }
    this.samplesCollected = 0;
  }
};
registerProcessor("recording-processor", RecordingProcessor);
//# sourceMappingURL=recording-processor.worklet.js.map