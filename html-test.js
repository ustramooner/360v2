/**
 *@NApiVersion 2.x
 *@NScriptType Suitelet
 */
define(['N/file', 'N/log', 'N/encode'],
    function(file, log, encode) {
        function onRequest(context) {
            if (context.request.method === 'GET') {
              var f= file.load({id:216717});

              var word = f.getContents();
              log.debug('f', word);
              log.debug('f url', f.url);
              log.debug('f online', f.isOnline);
              var decoded = encode.convert({
                    string: word,
                    inputEncoding: encode.Encoding.UTF_8,
                    outputEncoding: encode.Encoding.BASE_64
                });

              log.debug('decoded', decoded);

              context.response.writePage(f.getContents());
            }
        }
        return {
            onRequest: onRequest
        };
    });