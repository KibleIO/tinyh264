import Worker from './H264NALDecoder.worker'
import YUVSurfaceShader from './YUVSurfaceShader'
import Texture from './Texture'
import Worker1 from './second.worker'

let screenResolutions = [[1920, 1080], [1680, 1050], [1600, 900], [1440, 900],
                         [1400, 1050], [1366, 768], [1360, 768], [1280, 1024],
                         [1280, 960], [1280, 800], [1280, 720]]
let tinyH264Worker = null
let videoStreamId = 1

let canvas = null
/**
 * @type {YUVSurfaceShader}
 */
let yuvSurfaceShader = null
let yTexture = null
let uTexture = null
let vTexture = null

/**
 * @type {Array<Uint8Array>}
 */
const h264samples = []

let nroFrames = 0
let start = 0

/**
 * @param {Uint8Array} h264Nal
 */
function decode (h264Nal) {
	tinyH264Worker.postMessage({
		type: 'decode',
		data: h264Nal.buffer,
		offset: h264Nal.byteOffset,
		length: h264Nal.byteLength,
		renderStateId: videoStreamId
	}, [h264Nal.buffer])
}

/**
 * @param {{width:number, height:number, data: ArrayBuffer}}message
 */
function onPictureReady (message) {
	const { width, height, data } = message
	onPicture(new Uint8Array(data), width, height)
}

/**
 * @param {Uint8Array}buffer
 * @param {number}width
 * @param {number}height
 */
function onPicture (buffer, width, height) {
	canvas.width = width
	canvas.height = height

	// the width & height returned are actually padded, so we have to use the frame size to get the real image dimension
	// when uploading to texture
	const stride = width // stride
	// height is padded with filler rows

	// if we knew the size of the video before encoding, we could cut out the black filler pixels. We don't, so just set
	// it to the size after encoding
	const sourceWidth = width
	const sourceHeight = height
	const maxXTexCoord = sourceWidth / stride
	const maxYTexCoord = sourceHeight / height

	const lumaSize = stride * height
	const chromaSize = lumaSize >> 2

	const yBuffer = buffer.subarray(0, lumaSize)
	const uBuffer = buffer.subarray(lumaSize, lumaSize + chromaSize)
	const vBuffer = buffer.subarray(lumaSize + chromaSize, lumaSize + (2 * chromaSize))

	const chromaHeight = height >> 1
	const chromaStride = stride >> 1

	// we upload the entire image, including stride padding & filler rows. The actual visible image will be mapped
	// from texture coordinates as to crop out stride padding & filler rows using maxXTexCoord and maxYTexCoord.

	yTexture.image2dBuffer(yBuffer, stride, height)
	uTexture.image2dBuffer(uBuffer, chromaStride, chromaHeight)
	vTexture.image2dBuffer(vBuffer, chromaStride, chromaHeight)

	yuvSurfaceShader.setTexture(yTexture, uTexture, vTexture)
	yuvSurfaceShader.updateShaderData({ w: width, h: height }, { maxXTexCoord, maxYTexCoord })
	yuvSurfaceShader.draw()
}

function release () {
	if (tinyH264Worker) {
		tinyH264Worker.postMessage({ type: 'release', renderStateId: videoStreamId })
		tinyH264Worker = null
	}
}

function initWebGLCanvas () {
	canvas = document.createElement('canvas')
	const gl = canvas.getContext('webgl')
	yuvSurfaceShader = YUVSurfaceShader.create(gl)
	yTexture = Texture.create(gl, gl.LUMINANCE)
	uTexture = Texture.create(gl, gl.LUMINANCE)
	vTexture = Texture.create(gl, gl.LUMINANCE)

	document.body.append(canvas)
}

function screenValidator(width, height) {
        var i = 0

        while (i < screenResolutions.length &&
		(width < screenResolutions[i][0] || height < screenResolutions[i][1])) {

                i++
        }

        if (i >= screenResolutions.length) {
                return screenResolutions[i - 1]
        }

        return screenResolutions[i]
}

function main () {
	initWebGLCanvas()
	new Promise((resolve) => {
		/**
		* @type {Worker}
		* @private
		*/
		tinyH264Worker = new Worker()
		tinyH264Worker.addEventListener('message', (e) => {
			const message = /** @type {{type:string, width:number, height:number, data:ArrayBuffer, renderStateId:number}} */e.data
			switch (message.type) {
			case 'pictureReady':
				onPictureReady(message)
				break
			case 'decoderReady':
				resolve(tinyH264Worker)
				break
			}
		})
	})

	document.addEventListener("click", function() {
		var el = document.documentElement, rfs =
		el.requestFullScreen
		|| el.webkitRequestFullScreen
		|| el.mozRequestFullScreen
		|| el.msRequestFullScreen;
		rfs.call(el);
	});
	document.addEventListener('contextmenu', event => event.preventDefault())

	window.WebSocket = window.WebSocket || window.MozWebSocket

	var mysocket = new WebSocket(
	'ws://demo2.kible.io:9000', 'dumb-increment-protocol')

	mysocket.binaryType = 'arraybuffer'

	mysocket.onopen = function () {
		var buffer = new Uint8Array(4)
		var view = new DataView(buffer.buffer)
		var resValues = screenValidator(screen.width, screen.height)
		console.log(resValues[0] + " " + resValues[1])
		view.setUint32(0, resValues[0], true)

		mysocket.send(buffer)

		var buffer1 = new Uint8Array(4)
		var view1 = new DataView(buffer1.buffer)

		view1.setUint32(0, resValues[1], true)

		mysocket.send(buffer1)

		const workerr = new Worker1();
		workerr.addEventListener('message', function(event) {
			decode(new Uint8Array(event.data));
		}, false);
		workerr.postMessage("hello");
	};

        mysocket.onerror = function () {
                alert("failed to connect")
        };

        canvas.addEventListener('mousemove', e => {
                var buffer = new Uint8Array(16)
                var view = new DataView(buffer.buffer)

                view.setUint16(0, 0, true) //type
                view.setUint16(4, e.clientX, true) //x
                view.setUint16(6, e.clientY, true) //y
                view.setUint8 (8, 0, true) //clicked
                view.setUint16(10, 0, true) //button
                view.setUint16(12, 0, true) //state

                mysocket.send(buffer)
        })

	canvas.addEventListener('wheel', e => {
		if (e.deltaY < 0) {
			var buffer = new Uint8Array(16)
	                var view = new DataView(buffer.buffer)

	                view.setUint16(0, 0, true) //type
	                view.setUint16(4, e.clientX, true) //x
	                view.setUint16(6, e.clientY, true) //y
	                view.setUint8 (8, 1, true) //clicked
	                view.setUint16(10, 4, true) //button
	                view.setUint16(12, 1, true) //state

	                mysocket.send(buffer)

			var buffer1 = new Uint8Array(16)
	                var view1 = new DataView(buffer1.buffer)

	                view1.setUint16(0, 0, true) //type
	                view1.setUint16(4, e.clientX, true) //x
	                view1.setUint16(6, e.clientY, true) //y
	                view1.setUint8 (8, 1, true) //clicked
	                view1.setUint16(10, 4, true) //button
	                view1.setUint16(12, 0, true) //state

	                mysocket.send(buffer1)
		} else if (e.deltaY > 0) {
			var buffer = new Uint8Array(16)
	                var view = new DataView(buffer.buffer)

	                view.setUint16(0, 0, true) //type
	                view.setUint16(4, e.clientX, true) //x
	                view.setUint16(6, e.clientY, true) //y
	                view.setUint8 (8, 1, true) //clicked
	                view.setUint16(10, 5, true) //button
	                view.setUint16(12, 1, true) //state

	                mysocket.send(buffer)

			var buffer1 = new Uint8Array(16)
	                var view1 = new DataView(buffer1.buffer)

	                view1.setUint16(0, 0, true) //type
	                view1.setUint16(4, e.clientX, true) //x
	                view1.setUint16(6, e.clientY, true) //y
	                view1.setUint8 (8, 1, true) //clicked
	                view1.setUint16(10, 5, true) //button
	                view1.setUint16(12, 0, true) //state

	                mysocket.send(buffer1)
		}
	});

        canvas.addEventListener('mouseup', e => {
                var buffer = new Uint8Array(16)
                var view = new DataView(buffer.buffer)

                view.setUint16(0, 0, true) //type
                view.setUint16(4, e.clientX, true) //x
                view.setUint16(6, e.clientY, true) //y
                view.setUint8 (8, 1, true) //clicked
                view.setUint16(10, ((e.button == 0) ? 1 : 3), true) //button
                view.setUint16(12, 0, true) //state

                mysocket.send(buffer)
        })

        canvas.addEventListener('mousedown', e => {
                var buffer = new Uint8Array(16)
                var view = new DataView(buffer.buffer)

                view.setUint16(0, 0, true) //type
                view.setUint16(4, e.clientX, true) //x
                view.setUint16(6, e.clientY, true) //y
                view.setUint8 (8, 1, true) //clicked
                view.setUint16(10, ((e.button == 0) ? 1 : 3), true) //button
                view.setUint16(12, 1, true) //state

                mysocket.send(buffer)
        })

        document.addEventListener('keydown', e => {
                e.preventDefault()

                var buffer = new Uint8Array(16)
                var view = new DataView(buffer.buffer)

                view.setUint16(0, 1, true) //type
                view.setUint16(4, e.keyCode, true) //code
                view.setUint32(8, 1, true) //value

                mysocket.send(buffer)
        })

        document.addEventListener('keyup', e => {
                var buffer = new Uint8Array(16)
                var view = new DataView(buffer.buffer)

                view.setUint16(0, 1, true) //type
                view.setUint16(4, e.keyCode, true) //code
                view.setUint32(8, 0, true) //value

                mysocket.send(buffer)
	})
}

main()
