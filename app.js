var request = require ('request');
var restify = require ('restify');
var builder = require ('botbuilder');
var upperCase = require('upper-case');
var datetime = require("node-datetime");
var fs = require('fs');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
// ------------------------------------------------ ---------
// Configuration
// ------------------------------------------------ ---------

// Connector
var connectorAppId = process.env.MICROSOFT_APP_ID;
var connectorAppPassword = process.env.MICROSOFT_APP_PASSWORD;

// Open Weather Map
var openWeatherMapAppId = 'b6ba8217dfa0d64b01c13467847701ba';

// LUIS model
var luisModelUrl = 'https://westus.api.cognitive.microsoft.com/luis/v2.0/apps/a282e04d-fa60-43f1-89ba-0116156739dc?subscription-key=070c80ab17db4b0a98900894a2b1c957&timezoneOffset=-360&q=';

// MyCity Url(Where am i[http://ip-api.com/json])
var myCityUrl = 'http://ip-api.com/json';

//timezonedb Api Key
var timezonedbApiKey='RQ3SGFHPREET';

//Alpha Vantage Key
var alphaVantageKey='XQF5RZ0ZWBXKFDLE';
// ------------------------------------------------ ---------
// Setup
// ------------------------------------------------ ---------

// Setup Restify Server
var server = restify.createServer ();
server.listen (process.env.port || process.env.PORT || 3978, function () {
   console.log ('%s listening to %s', server.name, server.url); 
});

// Create connector and bot
var connector = new builder.ChatConnector({
    appId: connectorAppId,
    appPassword: connectorAppPassword
});

var bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());

// Create LUIS recognizer that points at our model and pass it to IntentDialog
var recognizer = new builder.LuisRecognizer(luisModelUrl);
var dialog = new builder.IntentDialog({ recognizers: [recognizer] });
bot.dialog('/', dialog);


//---------------------------------------------------------
// Dialogs
//---------------------------------------------------------


//---------------------------------------------------------
// Dialog for weather
//---------------------------------------------------------

dialog.matches('Weather.GetForecast', [
    function (session, args, next) {
        var city = builder.EntityRecognizer.findEntity(args.entities, 'Weather.Location');
		
		if (!city) {
			request(myCityUrl, function(err, response, body){
                var myCityResult = JSON.parse(body);
                var myCity = myCityResult.city;
                var words = myCity.split(/[(,\/  ]/);
                next({ response: words[0] });
            });
            
		} else {
			next({ response: city.entity });
		}
    },
    function (session, results) {
        openweathermap(results.response, function(success, previsions) {
			if (!success) return session.send('An error has occurred. Please try again.');
			
            var message = 'This is the weather for ' + previsions.city + ' :\n\n' +
            '\t\t'+previsions.weather+' \n\n' +            
						  '_ Temperature : ' + previsions.temperature + '°C\n\n' + 
						  '_ Humidity  : ' + previsions.humidity + '%\n\n' +
						  '_ Wind : ' + previsions.wind + 'km/h';
						  
			session.send(message);
		});
    }
]);




//---------------------------------------------------------
// Dialog for time of timezone
//---------------------------------------------------------

dialog.matches('displayTime', [
    function (session, args, next) {
        var timeAbb = builder.EntityRecognizer.findEntity(args.entities, 'timezoneAbbrevation');
        if (!timeAbb) {
   request(myCityUrl, function(err, response, body){
                var myCityResult = JSON.parse(body);
                var myTimezone = myCityResult.timezone; 
                next({ response: myTimezone });
            });
          } else {
            if(timeAbb.entity=='ist'){
                var rawdata = fs.readFileSync('timezoneAbbrevations.json');
                var abb = JSON.parse(rawdata);
                for(i = 0;i<1;i++){
                    mainKey = Object.keys(abb)[i];
                    
                    if(timeAbb.entity==mainKey)
                    console.log(mainKey);
                    break;
                }
                var msg = new builder.Message(session)
    .text("There are more then one timezones for "+upperCase(mainKey)+" abbrevation.Select Any one from them.")
    .suggestedActions(
        builder.SuggestedActions.create(
                session, [
                    builder.CardAction.imBack(session, Object.keys(abb[mainKey])[0], Object.keys(abb[mainKey])[0]),
                    builder.CardAction.imBack(session, Object.keys(abb[mainKey])[1],Object.keys(abb[mainKey])[1])
                ]
            ));
//session.send(msg);
builder.Prompts.text(session, msg);
           //     next({ response: abb[mainKey][Object.keys(abb[mainKey])[0]]});
            } 
            else{
            var timeAbbrevation = upperCase(timeAbb.entity);
            next({ response: timeAbbrevation });
            }
        }
    },
    function (session, results) {
        timezonedb(results.response, function(success, timezonedbprevisions) {
   if (!success) return session.send('An error has occurred. Please try again.');
            var dt = datetime.create(timezonedbprevisions.formattedTime);
            var formattedDateTime = dt.format('I:M p');
            var formattedDate = dt.format('W, d f Y');
            var message = 'Current Time in '+ timezonedbprevisions.abbreviation +' Timezone  ==> ' + formattedDateTime + ' :\n\n' +
         formattedDate ;
   session.send(message);
  });
    }
]);




dialog.matches('getStocks', [
    function (session, args, next) {
        var stockSymbol = builder.EntityRecognizer.findEntity(args.entities, 'stockSymbol');
        if (!stockSymbol) {
       builder.Prompts.text(session, 'Which stock Symbol do you want to know about the stocks?');
  } else {
   next({ response: stockSymbol.entity });
  }
    },
    function (session, results) {
            alphaVantage(results.response, function(success, aplhaVantagePrevisions) {
   if (!success) return session.send('An error has occurred. Please try again.');
            var message = 'Open : ' + aplhaVantagePrevisions.open + '\n\n' +
            'High :'+aplhaVantagePrevisions.high+' \n\n' +
        'Low : ' + aplhaVantagePrevisions.low + '\n\n' +
        'Close  : ' + aplhaVantagePrevisions.close + '\n\n' +
        'Volume : ' + aplhaVantagePrevisions.volume;
   session.send(message);
  });
}
]);







//var rawdata = fs.readFileSync('timezoneAbbrevations.json');  
//var abb = JSON.parse(rawdata);  
//console.log(abb); 

dialog.onDefault(function (session) {
    session.send('I did not understand your request, try instead to ask me the weather of a city!');
});


//---------------------------------------------------------
// Open Weather Map
//---------------------------------------------------------

var openweathermap = function(city, callback){
var url = 'http://api.openweathermap.org/data/2.5/weather?q=' + city + '&lang=fr&units=metric&appid=' + openWeatherMapAppId;

request(url, function(err, response, body){
    try{		
        var result = JSON.parse(body);
        
        if (result.cod != 200) {
            callback(false);
        } else {
            var previsions = {
                weather : result.weather[0].main,
                temperature : Math.round(result.main.temp),
                humidity : result.main.humidity,
                wind: Math.round(result.wind.speed * 3.6),
                city : result.name,
            };
              console.log(previsions);      
            callback(true, previsions);
        }
    } catch(e) {
        callback(false); 
    }
});
}


//---------------------------------------------------------
// timezonedb
//---------------------------------------------------------

var timezonedb = function(timeAbbrevation, callback){
    var timezonedbUrl = 'http://api.timezonedb.com/v2.1/get-time-zone?key='+timezonedbApiKey+'&format=json&by=zone&zone='+timeAbbrevation;
    
    request(timezonedbUrl, function(err, response, body){
        try{		
            var timezonedbResult = JSON.parse(body);
           
                var timezonedbprevisions = {
                    zoneName : timezonedbResult.zoneName,
                    formattedTime : timezonedbResult.formatted,
                    abbreviation : timezonedbResult.abbreviation,              
                };
                        
                callback(true, timezonedbprevisions);
            
        } catch(e) {
            callback(false); 
        }
    });
    }


//---------------------------------------------------------
//Alpha Vantage
//---------------------------------------------------------
var alphaVantage= function(stockSymbol, callback){
    var alphaVantageUrl = 'https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol='+stockSymbol+'&apikey='+alphaVantageKey;
    console.log(alphaVantageUrl);
    request(alphaVantageUrl, function(err, response, body){
        try{
            var aplhaVantageResult = JSON.parse(body);
            //console.log(aplhaVantageResult);
            var dt1 = datetime.create();
            dt1.offsetInDays(-1);
            jsonDateKey = dt1.format('Y-m-d');
           // console.log(jsonDateKey);
           // var mainkey=Object.keys(aplhaVantageResult)[1];
            var aplhaVantagePrevisions = {
                    open : aplhaVantageResult["Time Series (Daily)"][jsonDateKey]["1. open"],
                    high : aplhaVantageResult["Time Series (Daily)"][jsonDateKey]["2. high"],
                    low : aplhaVantageResult["Time Series (Daily)"][jsonDateKey]["3. low"],
                    close : aplhaVantageResult["Time Series (Daily)"][jsonDateKey]["4. close"],
                    volume : aplhaVantageResult["Time Series (Daily)"][jsonDateKey]["5. volume"]
                };
                  console.log(aplhaVantagePrevisions);
                callback(true, aplhaVantagePrevisions);
            } catch(e) {
                callback(false); 
            }
    });
    }