/**
 *@NApiVersion 2.x
 *@NScriptType scheduledscript
 */

define(['N/http', 'N/log', 'N/file'], function(http, log, file){

	function execute() {

		var path = 'http://ae01.alicdn.com/kf/HTB1C7yyaovMR1JjSZPcq6A1tFXa7.jpg';

        var response = http.get({
            url: path
        });

        log.debug('Response Body', response.body);
        log.debug('Response Code', response.code);
        log.debug('Response Headers', response.headers['Content-Type']);

        var fImage = file.create({
        	name : 'test.jpg',
        	fileType : file.Type.JPGIMAGE,
        	contents : response.body,
        	folder : 74831
        });

        var x = fImage.save();
        log.debug('File', x);
        
    }

    return {
    	execute  : execute 
    }


});