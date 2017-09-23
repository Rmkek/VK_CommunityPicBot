require("es6-shim");

var Canvas = require('canvas')
var Image = Canvas.Image

const fs = require("fs");
const https = require("https");
const VK = require("vk-io");

let vk = new VK();
let groupVK = new VK();

vk.setOptions({
  app: '',
  login: "",
  pass: "",
  key: "",
  scope: "photos"
});

groupVK.setOptions({
  app: '',
  key: "",
  scope: 4096
});

groupVK.setToken(
  ""
);

let userAuth = vk.auth.standalone();
userAuth
  .run()
  .then(token => {
    console.log("User token:", token);
    vk.setToken(token);
  })
  .catch(error => {
    console.error(error);
  });

let auth = groupVK.auth.server();
auth
  .then(token => {
    console.log("Server token:", token);
  })
  .then(() => {
    groupVK.longpoll.start().then(() => {
      console.log("Long Poll started.");
    });
  });

let sendingPhoto = false;
let sendingPhotoText = 'Новость в обработке'

groupVK.longpoll.on("message", message => {
  let isAlreadySendingPhoto = sendingPhoto && message.text != null && message.text != sendingPhotoText;
  let isAskingForHelpMessage = message.text == 'Новость' || message.text == 'новость';
  let messageisNoneOrDoesNotHaveCommand = message.text == null || message.text.indexOf('!') != 0
  let checkForTextAndPhoto = message.text != null && message.text != undefined && message.text.indexOf('!новость') == 0 && message.attachments.photo != null && message.attachments.photo !== undefined;

  if (isAlreadySendingPhoto) {
    message.send(sendingPhotoText);
    return
  }
  
  if (isAskingForHelpMessage) {
    message.send('Чтобы создать новость, нужно написать: !новость, текст названия вашей новости, текст описания. Обязательно указывайте между названием и описанием запятую.\nВажно! Прикрепите фото, иначе боту будет нечего обрабатывать.')
    return
  }
  if (messageisNoneOrDoesNotHaveCommand) {
    return
  }

  //TODO REFACTOR THIS IF SHIT
  console.log(`[DEBUG] Message: ${message}`)
  if (checkForTextAndPhoto) {
    console.log("[DEBUG] Got !news command in user message.");
    
    groupVK.api.messages.getHistory({
      peer_id: message.user,
      offset: 0,
      count: 1
    })
      .then((photo) => photo.items[0].attachments[0].photo)
      .then(photo => {
        const urlLarge = vk.getLargePhoto(photo)
        let extension = urlLarge.substring(urlLarge.lastIndexOf('.'), urlLarge.length)
        let DOWNLOAD_FILE_PIC = `${__dirname}/temp_${message.user}${extension}`
        let UPLOAD_FILE_PIC = `${__dirname}/image_${message.user}.png`
        
        console.log('[DEBUG] Download file URI: ', DOWNLOAD_FILE_PIC)
        console.log('[DEBUG] Upload file URI: ', UPLOAD_FILE_PIC)

        let file = fs.createWriteStream(DOWNLOAD_FILE_PIC);
        https.get(urlLarge, function(response) {
          response.pipe(file);
        });
        
        file.on('finish', () => {
          fs.readFile(DOWNLOAD_FILE_PIC, (err,    buff) => {
            if (err) throw err;

            let img = new Image;
            img.src = buff;

            let params = message.text.split(', ')
            if (params.length == 1) {
               message.send('Неправильная команда! Пример - !новость, тест, тест и прикреплённое фото.')
               return 
            };

            let data
            if (params.length == 4 && 0 <= params[3] && params[3] <= 4) {
               console.log('[DEBUG] Passing third arg into canvasApp...')
               data = canvasApp(params[1], params[2], img, params[3])
            } else {
               data = canvasApp(params[1], params[2], img)
            }

            let buf = new Buffer(data, 'base64');
            let writeStream = fs.createWriteStream(UPLOAD_FILE_PIC) 
            writeStream.write(buf)
            sendingPhoto = true;
            writeStream.end()
            console.log('[DEBUG] File is sucessfuly written to the disk.')

            writeStream.on('finish', () => {
              let photo = fs.createReadStream(UPLOAD_FILE_PIC)
              console.log('[DEBUG] Sending photo.')
              message.sendPhoto(photo)
                .then(() => {
                  /*photo.close()
                  file.close()
                  writeStream.close()
  
                  fs.unlinkSync(UPLOAD_FILE_PIC, (err) => {
                    if (err) {
                      console.log('Can\'t delete photo!')
                    } else {
                      console.log('Photo sucessfully deleted.')
                    }
                  })
  
                  fs.unlinkSync(DOWNLOAD_FILE_PIC, (err) => {
                    if (err) {
                      console.log('Can\'t delete local userpic!')
                    } else {
                      console.log('Userpic sucessfully deleted.')
                    } 
                  })*/ 
                  //TODO: ADD PHOTO DELETION
                  sendingPhoto = false
                })
            })
            
          })
        })
      })
      .catch((err) => {
          console.log('[EXCEPTION]')
          console.log(err)
          message.send('Произошла ошибка, попробуйте ещё раз.')
      });
  } else {
      let err_text = 'Произошла ошибка, попробуй ещё раз.'
      let text = 'Неправильная команда! Пример - !новость, тест, тест и прикреплённое фото.'
      if ((message.text != text && message.attachments.photo == undefined && message.text != err_text) ||
          (message.text != null  && !(message.text.indexOf('!новость') == 0) && message.attachments.photo != undefined)) {
        message.send(text)
      }
  }
});

function drawImageProp(context, img, offset = 0.5, x = 0, y = 0, w = 1280, h = 720) {

  /// default offset is center
  let offsetX = 0.5;
  let offsetY = offset * 0.25;

  /// keep bounds [0.0, 1.0]
  if (offsetX < 0) offsetX = 0;
  if (offsetY < 0) offsetY = 0;
  if (offsetX > 1) offsetX = 1;
  if (offsetY > 1) offsetY = 1;

  let iw = img.width;
  let ih = img.height;
  let r = Math.min(w / iw, h / ih);
  let nw = iw * r; /// new prop. width
  let nh = ih * r; /// new prop. height
  let cx = 1;
  let cy = 1;
  let cw = 1;
  let ch = 1;
  let ar = 1;

  /// decide which gap to fill
  if (nw < w) ar = w / nw;
  if (nh < h) ar = h / nh;
  nw *= ar;
  nh *= ar;

  /// calc source rectangle
  cw = iw / (nw / w);
  ch = ih / (nh / h);

  cx = (iw - cw) * offsetX;
  cy = (ih - ch) * offsetY;

  /// make sure source rectangle is valid
  if (cx < 0) cx = 0;
  if (cy < 0) cy = 0;
  if (cw > iw) cw = iw;
  if (ch > ih) ch = ih;

  /// fill image in dest. rectangle
  context.drawImage(img, cx, cy, cw, ch, x, y, w, h);
}

function canvasApp(msg = "По умолчанию", tckrmsg = "Ваш текст через запятую", image, offset) {
  var message = msg;
  var tickermessage = tckrmsg; 

  let theCanvas = new Canvas(1280, 720)
  let context = theCanvas.getContext("2d");

  var imageObj = image;

  return drawScreen();

  function drawScreen() {
    // Background
    context.fillStyle = "#222222";
    context.fillRect(0, 0, theCanvas.width, theCanvas.height);

    drawImageProp(context, imageObj, offset);

    // Live
    context.fillStyle = "rgba(194, 21, 15, 1.000)";
    context.fillRect(80, 40, 104, 60);
    context.font = "700 36px Signika";
    context.fillStyle = "#FFFFFF";
    context.fillText("LIVE", 96, 84);

    // Box
    context.fillStyle = "rgba(255,255,255,0.85)";
    context.fillRect(80, 510, 1200, 110);

    // Clock

    context.fillStyle = "#000";
    context.fillRect(80, 620, 100, 60);

    let today = new Date();
    var m = today.getMinutes();
    var h = today.getHours();

    if (m < 10) {
      m = "0" + m;
    }

    context.font = "700 28px Signika";
    context.fillStyle = "#FFFFFF";
    context.fillText(h + ":" + m, 96, 660);

    // Breaking News Strap
    // Create gradient
    let redgrd = context.createLinearGradient(0, 430, 0, 510);

    // Add colors
    redgrd.addColorStop(0.0, "rgba(109, 36, 39, 1.000)");
    redgrd.addColorStop(0.015, "rgba(224, 54, 44, 1.000)");
    redgrd.addColorStop(0.455, "rgba(194, 21, 15, 1.000)");
    redgrd.addColorStop(0.488, "rgba(165, 10, 1, 1.000)");
    redgrd.addColorStop(1.0, "rgba(109, 36, 39, 1.000)");

    context.fillStyle = redgrd;
    context.fillRect(80, 430, 420, 80);

    context.font = "700 48px Signika";
    context.fillStyle = "#FFFFFF";
    context.fillText("BREAKING NEWS", 100, 488);

    // Text
    context.font = "700 72px Signika";
    context.fillStyle = "#000000";
    context.fillText(message.toUpperCase(), 100, 590);

    // Ticker
    context.fillStyle = "#feeb1a";
    context.fillRect(180, 620, 1100, 60);

    context.font = "700 28px Signika";
    context.fillStyle = "#000";
    context.fillText(tickermessage.toUpperCase(), 200, 660);

    // Logo
    context.shadowColor = "rgba(0,0,0,0.7)";
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    context.shadowBlur = 6;
    context.globalAlpha = 0.6;
    context.font = "400 36px Signika";
    context.fillStyle = "#fff";
    context.fillText("vk.com/vaznuenews", 860, 80);
    context.globalAlpha = 1;
    context.shadowBlur = 0;


    let cnvas = theCanvas.toDataURL()    
    let data = cnvas.replace(/^data:image\/\w+;base64,/, "");
    return data
  }
}
