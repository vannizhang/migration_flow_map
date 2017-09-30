/**
 * Project: County Migration Flows Map
 * Version: 1.0
 * Author:    Vanni Zhang
 * Modified:   05.29.2015
 * 
 * (c) No copyright, have fun...
 **/

var width = 1280,
    height = 700;

var migrationFlowsData;
var targetCounty;
var flowType = 'inflow';
var selectedCounty;
var arc;
var countiesLookup;

var projection = d3.geo.azimuthal()
    .mode("equidistant")
    .origin([-98, 38])
    .scale(1400)
    .translate([640, 360]);

//Creates a new geographic path generator with the default settings
var path = d3.geo.path()
    .projection(projection);

var svg = d3.select("#map").append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("class", "center");

var g = svg.append("g");

//state boundary and county polygons
var states = svg.append("svg:g");

var centroids = svg.append("svg:g")
    .attr("id", "cells");

var flowTypeLookup = {
    "inflow": {
        "direction": "destination",
        "colors": ['#a6bddb', '#74a9cf', '#3690c0', '#0570b0', '#034e7b']
    },
    "outflow": {
        "direction": "origin",
        "colors": ['#99d8c9', '#66c2a4', '#41ae76', '#238b45', '#005824']
    }
}

//load topojson file to draw state and county boundaries 
d3.json("./js/us.json", function(error, topology) {
    //add county boundaries
    states.selectAll("path")
        .data(topojson.feature(topology, topology.objects.counties).features)
        .enter().append("path")
        .attr("class", "counties")
        .attr("d", path)
        .attr("fill", "#aaa")
        .on("mouseover", function(d) {   
            //Get this county's x/y values, then augment for the tooltip
            var xPosition = d3.select(this).attr("x");
            var yPosition = d3.select(this).attr("y");

            //Update the content used for tooltip
            function getTooltipContent(d){
                // console.log(migrationFlowsData);
                var content = "<b>"+countiesLookup[d.id].NAME + " County, " + countiesLookup[d.id].STATE_NAME  + "</b>";
                var switchContent = function(){
                    return flowType === 'inflow' 
                        ? 'moved <br> from ' + content + '<br> to <b>' + selectedCounty + '</b></p>' 
                        : 'moved <br> from <b>' + selectedCounty + '</b><br> to ' + content + '<p>';
                } 
                return migrationFlowsData === undefined || migrationFlowsData[flowType][d.id] === undefined 
                        ? content
                        : content = "<p>There are <b>" + migrationFlowsData[flowType][d.id] + "</b> people " + switchContent();
            }
            //Update the tooltip position and value
            d3.select("#tooltip")
                //Show the tooltip above where the mouse triggers the event
                .style("left", (d3.event.pageX) + "px")     
                .style("top", (d3.event.pageY - 70) + "px")
                .select("#county-label")    
                .html(getTooltipContent(d))         
            //Show the tooltip
            d3.select("#tooltip").classed("hidden", false);
        })
        .on("mouseout", function() {
            //Hide the tooltip
            d3.select("#tooltip").classed("hidden", true);
        })
        .on('click', clicked);
    //add state boundaries
    states.append("path")
        .datum(topojson.mesh(topology, topology.objects.states, function(a, b) { return a !== b; }))
        .attr("class", "states")
        .attr("d", path);    
});

var clicked = function(d){
    getFlows(d.id);
}

//send request to server to retrieve the flow data by county FIPS 
var getFlows = function(d){
    targetCounty = d;
    selectedCounty = countiesLookup[targetCounty].NAME + " County, " + countiesLookup[targetCounty].STATE_NAME;
    migrationFlowsData = {"inflow":{}, "outflow":{}};

    $.get('https://api.vannizhang.com/getCountyMigrationFlows', { fips: targetCounty  }, function(d){
        // console.log(d);
      })
      .done(function(d) {
        for (var i = d.features.length - 1; i >= 0; i--) {
            //convert the array with county migration flows data into an object (migrationFlowsData)
            var object = d.features[i].properties.counties.reduce(function(obj, value, index) {
                var res = value.split(':') 
                obj[res[0]] = parseInt(res[1]);
                return obj;
            },{});
            migrationFlowsData[d.features[i].properties.flowtype] = object;
        };
        displayFlows(migrationFlowsData);
      })
      .fail(function() {
        alert( "error" );
      }); 
}

var displayFlows = function(d){

    if(targetCounty !== undefined){
        //create a new object only holds the county fips data
        var data = {"inflow":[], "outflow":[]};
        //create a new object holds the origin & destination data
        var linksByTargetCounty = {};

        $("#appTitle").html('<b>' + selectedCounty + '</b> as <b>' + flowTypeLookup[flowType].direction + '</b>');  

        $.each( data, function( key, value ) {
            $.each(d[key], function (index, items) {
                //index here is the county fips
                data[key].push(parseInt(index));
            })
        });        

        d3.selectAll("path").attr( "fill", function(county){ 

            //if county in the FIPS list, render it based on flow types and number of people
            if (data[flowType].indexOf(county.id) > -1){
                return migrationFlowsData[flowType][county.id] > 100  ? flowTypeLookup[flowType].colors[4] :
                       migrationFlowsData[flowType][county.id] > 50   ? flowTypeLookup[flowType].colors[3] :
                       migrationFlowsData[flowType][county.id] > 20   ? flowTypeLookup[flowType].colors[2] :
                       migrationFlowsData[flowType][county.id] > 10   ? flowTypeLookup[flowType].colors[1] :
                                                flowTypeLookup[flowType].colors[0];      
            } 
            //highlight the selected county
            else if (county.id == targetCounty){
                return "#3C1518";
            } 
            else {
                return "#aaa";
            }            
        });

        // d3.select(clickedPolygon).attr( "fill", "#3C1518" );

        for (var i = data[flowType].length - 1; i >= 0; i--) {
            var origin = targetCounty,
            destination = data[flowType][i],
            links = linksByTargetCounty[origin] || (linksByTargetCounty[origin] = []);
            links.push({source: origin, target: destination});     
        };

        //remove existing arcs on map
        g.selectAll("path.arc").remove();

        //draw new arcs
        g.selectAll("path.arc")
            .data(function(d) { 
              return parseInt(d.FIPS) == parseInt(targetCounty) ? linksByTargetCounty[parseInt(d.FIPS)] : [];
            })
            .enter().append("svg:path")
            .attr("class", "arc")
            .attr("d", function(d) { 
              console.log(d);
              return path(arc(d)); 
            });         
    } else {
        alert('Please selet a county by clicking the map')
    }
}

d3.csv("./js/cnty.csv", function(counties) {

    var locationByCounty = {};
    var positions = [];

    //the function generates arcs
    arc = d3.geo.greatArc()
      .source(function(d) { return locationByCounty[d.source]; })
      .target(function(d) { return locationByCounty[d.target]; });

    var allCounties = counties.filter(function(counties) {
        var location = [+counties.LON, +counties.LAT];
        locationByCounty[counties.FIPS] = location;
        positions.push(projection(location));
        // positions.push(location);
        return true;
    });

    g = centroids.selectAll("g")
        .data(allCounties)
      .enter().append("svg:g");

    countiesLookup = counties.reduce(function(obj, value, index) {
        obj[value.FIPS] = value;
        return obj;
    },{});
});

$('.flow-link').click(function(){
    flowType = this.id;
    displayFlows(migrationFlowsData);
})

$(".nav a").on("click", function(){
   $(".nav").find(".active").removeClass("active");
   $(this).parent().addClass("active");
});

$(document).ready(function(e) {
    $.getJSON( "./js/autocomplete_data.json", function( data ) {
        // console.log(data.counties);
        $( "#countySearchInput" ).autocomplete({
            // source: counties,
            source: data.counties,
            minLength: 3,
            focus: function(event, ui) {
                // prevent autocomplete from updating the textbox
                event.preventDefault();
                // manually update the textbox
                $(this).val(ui.item.label);
            },            
            select: function (event, ui) {
                try {
                    if (ui) {
                            // prevent autocomplete from updating the textbox
                            event.preventDefault();
                            getFlows(ui.item.value);
                    }
                } catch (err) {
                    //null
                }
            }
        });        
    })
    .error(function(xhr) {
        console.log(xhr);
    });
});
