import * as BodyPix from '@tensorflow-models/body-pix';
import { ModelConfig } from '@tensorflow-models/body-pix/dist/body_pix_model';

class PIP {
  private maximumReducedVideoHeight: 720 | 540 | 450 | 360 | 270 | 180 | 90 | 9;

  private rawVideoCanvas: HTMLCanvasElement;

  private reducedVideoCanvas: HTMLCanvasElement;

  private foregroundCanvas: HTMLCanvasElement;

  private processedVideoCanvas: HTMLCanvasElement;

  private webcamVideo: HTMLVideoElement;

  private screenshareVideo: HTMLVideoElement;

  private webcamStream: MediaStream = null;

  private screenshareStream: MediaStream = null;

  private bodyPix: BodyPix.BodyPix = null;

  private backgroundType: 'image' | 'stream' | 'none';

  private virtualBGImage: HTMLImageElement;

  private foregroundPositionStartX: number;

  private foregroundPositionStartY: number;

  private foregroundPositionWidth: number;

  private foregroundPositionHeight: number;

  private isEffectOn: boolean;

  private isDebugModeOn: boolean;

  private onStopScreenShare: Function;

  constructor(params?: {
    config?: ModelConfig;
    onStopScreenShare?: Function;
  }) {
    const {
      config,
      onStopScreenShare,
    } = params || { config: null, onStopScreenShare: (): void => null };

    if (config === null) {
      BodyPix.load().then((bodyPix) => {
        this.bodyPix = bodyPix;
      });
    } else {
      BodyPix.load(config).then((bodyPix) => {
        this.bodyPix = bodyPix;
      });
    }

    if (onStopScreenShare) this.onStopScreenShare = onStopScreenShare;

    this.webcamVideo = document.createElement('video');
    this.webcamVideo.autoplay = true;
    this.webcamVideo.muted = true;

    this.screenshareVideo = document.createElement('video');
    this.screenshareVideo.autoplay = true;
    this.screenshareVideo.muted = true;

    this.rawVideoCanvas = document.createElement('canvas');
    // document.body.append(this.rawVideoCanvas);

    this.reducedVideoCanvas = document.createElement('canvas');
    // document.body.append(this.reducedVideoCanvas);

    this.foregroundCanvas = document.createElement('canvas');

    this.processedVideoCanvas = document.createElement('canvas');
    // document.body.append(this.processedVideoCanvas);

    this.virtualBGImage = document.createElement('img');
    this.virtualBGImage.src = 'images/backgrounds/default_video_background_4x3.png';

    // ----- initial configs --------------------------------
    this.backgroundType = 'none';

    this.isEffectOn = false;
    this.setVideoSize('small');

    this.isDebugModeOn = false;

    this.maximumReducedVideoHeight = 450;
    // ----- initial configs --------------------------------
  }

  public initializeRender = async (): Promise<void> => {
    if (this.backgroundType === 'stream' && this.screenshareStream === null) {
      await this.startScreenShareMediaStream();
    }

    // Initialize render
    this.renderProcessedVideoCanvas();
  };

  public attachStream = (stream: MediaStream): void => {
    this.webcamStream = stream;
    this.webcamVideo.srcObject = this.webcamStream;
    this.webcamVideo.play();
  };

  public dettachStream = (): void => {
    this.webcamStream = null;
  };

  public startScreenShare = async (): Promise<void> => {
    await this.startScreenShareMediaStream();

    this.backgroundType = 'stream';

    this.isEffectOn = true;
    this.setVideoSize('small');
  };

  public stopScreenShare = (): void => {
    if (this.screenshareStream) {
      const tracks = this.screenshareStream.getTracks();
      tracks.forEach((track) => {
        track.stop();
      });
    }

    this.backgroundType = 'none';
    this.isEffectOn = false;
  };

  public turnEffectOn = (isEffectOn: boolean): void => {
    this.isEffectOn = isEffectOn;
  };

  public setVideoSize = (videoSize: 'full' | 'intermediate' | 'small'): void => {
    switch (videoSize) {
      case 'full': {
        this.foregroundPositionStartX = 0;
        this.foregroundPositionStartY = 0;
        this.foregroundPositionWidth = 1;
        this.foregroundPositionHeight = 1;
        break;
      }

      case 'intermediate': {
        this.foregroundPositionStartX = 0.5;
        this.foregroundPositionStartY = 0.5;
        this.foregroundPositionWidth = 0.5;
        this.foregroundPositionHeight = 0.5;
        break;
      }

      case 'small': {
        this.foregroundPositionStartX = 0.75;
        this.foregroundPositionStartY = 0.75;
        this.foregroundPositionWidth = 0.25;
        this.foregroundPositionHeight = 0.25;
        break;
      }

      default:
        break;
    }
  };

  private startScreenShareMediaStream = async (): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.screenshareStream = await (navigator.mediaDevices as any).getDisplayMedia({
      audio: false,
      video: {
        displaySurface: 'monitor',
        logicalSurface: true,
        cursor: true,
        width: { max: 1280 },
        height: { max: 720 },
        frameRate: { max: 10 },
      },
    });

    this.screenshareVideo.srcObject = this.screenshareStream;
    this.screenshareVideo.play();

    this.screenshareStream.getTracks()[0].addEventListener('ended', () => {
      this.stopScreenShare();
      this.onStopScreenShare();
    });
  };

  private renderProcessedVideoCanvas = async (): Promise<void> => {
    const startingTime = new Date().getTime();

    if (
      this.webcamStream
      && this.webcamStream.getVideoTracks()[0]
      && this.webcamStream.getVideoTracks()[0].getSettings().width !== 0
      && this.webcamStream.getVideoTracks()[0].getSettings().height !== 0
    ) {
      this.rawVideoCanvas.width = this.webcamStream.getVideoTracks()[0].getSettings().width;
      this.rawVideoCanvas.height = this.webcamStream.getVideoTracks()[0].getSettings().height;

      const ctx = this.rawVideoCanvas.getContext('2d');
      ctx.drawImage(this.webcamVideo, 0, 0, this.rawVideoCanvas.width, this.rawVideoCanvas.height);

      this.reducedVideoCanvas.width = this.maximumReducedVideoHeight
        * (this.rawVideoCanvas.width / this.rawVideoCanvas.height);

      this.reducedVideoCanvas.height = this.maximumReducedVideoHeight;

      const ctx2 = this.reducedVideoCanvas.getContext('2d');
      ctx2.drawImage(
        this.webcamVideo,
        0,
        0,
        this.maximumReducedVideoHeight * (this.rawVideoCanvas.width / this.rawVideoCanvas.height),
        this.maximumReducedVideoHeight,
      );

      if (this.bodyPix && this.isEffectOn) {
        this.bodyPix.segmentPerson(this.reducedVideoCanvas).then(async (segmentation) => {
          // Draw background image
          if (this.backgroundType === 'image') {
            const BGctx = this.processedVideoCanvas.getContext('2d');

            BGctx.drawImage(
              this.virtualBGImage,
              0,
              0,
              this.processedVideoCanvas.width,
              this.processedVideoCanvas.height,
            );
          } else if (this.backgroundType === 'stream' && this.screenshareStream) {
            const BGctx = this.processedVideoCanvas.getContext('2d');

            this.processedVideoCanvas.width = this.screenshareStream
              .getVideoTracks()[0].getSettings().width;

            this.processedVideoCanvas.height = this.screenshareStream
              .getVideoTracks()[0].getSettings().height;

            BGctx.drawImage(
              this.screenshareVideo,
              0,
              0,
              this.screenshareStream.getVideoTracks()[0].getSettings().width,
              this.screenshareStream.getVideoTracks()[0].getSettings().height,
            );
          } else {
            const BGctx = this.processedVideoCanvas.getContext('2d');

            BGctx.drawImage(
              this.processedVideoCanvas,
              0,
              0,
              this.webcamVideo.videoWidth,
              this.webcamVideo.videoHeight,
            );
          }

          const pixelData = new Uint8ClampedArray(segmentation.width * segmentation.height * 4);

          const fgImageData = this.reducedVideoCanvas.getContext('2d').getImageData(
            0,
            0,
            this.reducedVideoCanvas.width,
            this.reducedVideoCanvas.height,
          );

          for (let rowIndex = 0; rowIndex < segmentation.height; rowIndex += 1) {
            for (let colIndex = 0; colIndex < segmentation.width; colIndex += 1) {
              const segOffset = ((rowIndex * segmentation.width) + colIndex);
              const pixOffset = ((rowIndex * segmentation.width) + colIndex) * 4;
              if (segmentation.data[segOffset] === 0) {
                pixelData[pixOffset] = 0;
                pixelData[pixOffset + 1] = 0;
                pixelData[pixOffset + 2] = 0;
                pixelData[pixOffset + 3] = 0;
              } else {
                pixelData[pixOffset] = fgImageData.data[pixOffset];
                pixelData[pixOffset + 1] = fgImageData.data[pixOffset + 1];
                pixelData[pixOffset + 2] = fgImageData.data[pixOffset + 2];
                pixelData[pixOffset + 3] = fgImageData.data[pixOffset + 3];
              }
            }
          }

          if (pixelData.length > 0) {
            const imageData = new ImageData(pixelData, segmentation.width, segmentation.height);
            this.foregroundCanvas.width = imageData.width;
            this.foregroundCanvas.height = imageData.height;
            this.foregroundCanvas.getContext('2d').putImageData(imageData, 0, 0);
          } else {
            this.foregroundCanvas.width = this.processedVideoCanvas.width;
            this.foregroundCanvas.height = this.processedVideoCanvas.height;
          }

          // Draw processed video canvas
          this.processedVideoCanvas.getContext('2d').drawImage(
            this.foregroundCanvas,
            this.foregroundPositionStartX * (
              this.screenshareStream.getVideoTracks()[0].getSettings().width
              || this.rawVideoCanvas.width
            ),
            this.foregroundPositionStartY * (
              this.screenshareStream.getVideoTracks()[0].getSettings().height
              || this.rawVideoCanvas.height
            ),
            this.foregroundPositionWidth * (
              this.screenshareStream.getVideoTracks()[0].getSettings().height * (this.rawVideoCanvas.width / this.rawVideoCanvas.height)
              || this.rawVideoCanvas.width
            ),
            this.foregroundPositionHeight * (
              this.screenshareStream.getVideoTracks()[0].getSettings().height
              || this.rawVideoCanvas.height
            ),
          );

          const timeOnFrame = new Date().getTime() - startingTime;
          const waitMs = 100 - timeOnFrame;
          if (waitMs) await this.wait(waitMs);
          if (this.isDebugModeOn) {
            // eslint-disable-next-line no-console
            console.log(`[1] FPS: ${Math.round(10000 / (new Date().getTime() - startingTime)) / 10}`);
          }
          await this.renderProcessedVideoCanvas();
        });
      } else {
        this.processedVideoCanvas.width = this.rawVideoCanvas.width;
        this.processedVideoCanvas.height = this.rawVideoCanvas.height;

        if (this.processedVideoCanvas.width !== 0 || this.processedVideoCanvas.height !== 0) {
          this.processedVideoCanvas.getContext('2d').drawImage(
            this.rawVideoCanvas,
            0,
            0,
            this.rawVideoCanvas.width,
            this.rawVideoCanvas.height,
          );
        }

        const timeOnFrame = new Date().getTime() - startingTime;
        const waitMs = 100 - timeOnFrame;
        if (waitMs) await this.wait(waitMs);
        if (this.isDebugModeOn) {
          // eslint-disable-next-line no-console
          console.log(`[2] FPS: ${Math.round(10000 / (new Date().getTime() - startingTime)) / 10}`);
        }
        await this.renderProcessedVideoCanvas();
      }
    } else {
      const timeOnFrame = new Date().getTime() - startingTime;
      const waitMs = 100 - timeOnFrame;
      if (waitMs) await this.wait(waitMs);
      if (this.isDebugModeOn) {
        // eslint-disable-next-line no-console
        console.log(`[3] FPS: ${Math.round(10000 / (new Date().getTime() - startingTime)) / 10}`);
      }
      await this.renderProcessedVideoCanvas();
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public captureStream = (): MediaStream => (this.processedVideoCanvas as any).captureStream();

  private wait = (ms: number): Promise<void> => new Promise((r, j) => setTimeout(r, ms));
}

export default PIP;
