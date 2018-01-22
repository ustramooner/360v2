/**
* @NApiversion 2.x
* @NScriptType Suitelet
*/

define(['N/ui/serverWidget','N/file','N/encode'], function(ui, file, encode){
	
	function onRequest(context){
		if (context.request.method === 'GET') {
            var form = ui.createForm({
                title: 'Demo Suitelet Form '
            });
            var subject = form.addField({
                id: 'filename',
                type: ui.FieldType.TEXTAREA,
                label: 'UTF_8'
            });

            subject.layoutType = ui.FieldLayoutType.NORMAL;
            subject.breakType = ui.FieldBreakType.STARTCOL;
            subject.isMandatory = true;
               
            var f = file.load(226561);
            
            var base64EncodedString = encode.convert({
                string: f.getContents(),
                inputEncoding: encode.Encoding.UTF_8,
                outputEncoding: encode.Encoding.UTF_8
            });

            subject.defaultValue = toUTF8Array(f.getContents());

            context.response.writePage(form);
        }
	}

	function toUTF8Array(str) {
	    var utf8 = [];
	    for (var i=0; i < str.length; i++) {
	        var charcode = str.charCodeAt(i);
	        if (charcode < 0x80) utf8.push(charcode);
	        else if (charcode < 0x800) {
	            utf8.push(0xc0 | (charcode >> 6), 
	                      0x80 | (charcode & 0x3f));
	        }
	        else if (charcode < 0xd800 || charcode >= 0xe000) {
	            utf8.push(0xe0 | (charcode >> 12), 
	                      0x80 | ((charcode>>6) & 0x3f), 
	                      0x80 | (charcode & 0x3f));
	        }
	        // surrogate pair
	        else {
	            i++;
	            // UTF-16 encodes 0x10000-0x10FFFF by
	            // subtracting 0x10000 and splitting the
	            // 20 bits of 0x0-0xFFFFF into two halves
	            charcode = 0x10000 + (((charcode & 0x3ff)<<10)
	                      | (str.charCodeAt(i) & 0x3ff));
	            utf8.push(0xf0 | (charcode >>18), 
	                      0x80 | ((charcode>>12) & 0x3f), 
	                      0x80 | ((charcode>>6) & 0x3f), 
	                      0x80 | (charcode & 0x3f));
	        }
	    }
	    return utf8;
	}

	return {
		onRequest : onRequest
	}
})