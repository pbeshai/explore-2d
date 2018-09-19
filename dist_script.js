var points;
var allData;
var activePoints;
var displayedPointNode = d3.select('.displayed-point');
var highlightedPoint;
var activePoint;

var xScale;
var yScale;
var colorScale;
var voronoiDiagram;

var radius = 4;
var glow = true;

/** Configuration for reading from points  */
var colorKey = 'cluster';

function getPointsFromData(data) {
  return data.points;
}

function getX(point) {
  return point.position[0];
}

function getY(point) {
  return point.position[1];
}

function getHtml(point) {
  // return JSON.stringify(point);
  var html = Object.keys(point)
    .map(
      function (key) { return ("<div class='point-prop'>\n          <div class='point-prop-label'>" + key + "</div>\n          <div class='point-prop-value'>" + (point[key]) + "</div>\n        </div>"); }
    )
    .join('\n');

  return html;
}

// used when filtering via search to see if a point matches the
// entered string
function checkSubstringMatch(point, substring) {
  var pointString = JSON.stringify(point).toLowerCase();
  return pointString.includes(substring.toLowerCase());
}

/** end configuration */

var filters = {
  search: undefined,
};

var queryParams = window.location.search
  .substring(1)
  .split('&')
  .filter(function (d) { return d != ''; })
  .reduce(function (params, param) {
    var entry = param.split('=');
    params[entry[0]] = entry[1];
    return params;
  }, {});

console.log('url query params', queryParams);

/** Initialize Canvas */
var width = window.innerWidth;
var height = window.innerHeight;
var padding = { top: 100, right: 40, bottom: 40, left: 40 };
var plotAreaWidth = width - padding.left - padding.right;
var plotAreaHeight = height - padding.top - padding.bottom;

var screenScale = window.devicePixelRatio || 1;
var canvas = d3
  .select('#main-canvas')
  .attr('width', width * screenScale)
  .attr('height', height * screenScale)
  .style('width', (width + "px"))
  .style('height', (height + "px"));
canvas
  .node()
  .getContext('2d')
  .scale(screenScale, screenScale);

/** Initialize highlight SVG */
var highlightSvg = d3
  .select('#highlight-svg')
  .attr('width', width)
  .attr('height', height);
highlightSvg.selectAll('*').remove();

var highlightG = highlightSvg
  .append('g')
  .attr('transform', 'translate(' + padding.left + ' ' + padding.top + ')');

var gZoom = highlightG.append('g');

var highlightPointNode = gZoom
  .append('g')
  .attr('class', 'point')
  .style('opacity', 0);

highlightPointNode
  .append('circle')
  .attr('r', 15)
  .attr('class', 'highlight-point-circle')
  .attr('stroke', '#000')
  .attr('stroke-width', 3)
  .attr('fill', '#fff')
  .attr('fill-opacity', 0.1);

function displayPoint(point, fade) {
  var text = point.content;
  var displayHtml = getHtml(point);

  displayedPointNode.style('opacity', 1).html(displayHtml);

  highlightPointNode
    .style('opacity', 1)
    .attr(
      'transform',
      ("translate(" + (xScale(getX(point))) + ", " + (yScale(getY(point))) + ")")
    );
}

function drawPoint(ctx, point, radius, stroke) {
  var x = xScale(getX(point));
  var y = yScale(getY(point));

  var color = d3.color(colorScale(point[colorKey]));

  // draw glowy gradient
  if (glow) {
    var gradientRadius = radius * 8;
    var grd = ctx.createRadialGradient(x, y, radius, x, y, gradientRadius);
    grd.addColorStop(0, ("rgba(" + (color.r) + ", " + (color.g) + ", " + (color.b) + ", 0.3)"));
    grd.addColorStop(0.3, ("rgba(" + (color.r) + ", " + (color.g) + ", " + (color.b) + ", 0.03)"));
    grd.addColorStop(1, ("rgba(" + (color.r) + ", " + (color.g) + ", " + (color.b) + ", 0)"));
    ctx.fillStyle = grd;
    ctx.fillRect(
      x - gradientRadius,
      y - gradientRadius,
      gradientRadius * 2,
      gradientRadius * 2
    );
  }

  // draw core circle
  ctx.fillStyle = color.toString();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.fill();

  if (stroke) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function render() {
  // console.warn('RENDER', transform);
  // update the highlight transform
  gZoom.attr('transform', transform);

  var ctx = canvas.node().getContext('2d');
  ctx.save();

  // erase what is on the canvas currently
  ctx.clearRect(0, 0, width, height);
  ctx.globalAlpha = 0.8;

  ctx.translate(padding.left, padding.top);

  // apply zoom transform
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.k, transform.k);

  colorScale = d3
    .scaleOrdinal()
    .domain([].concat( new Set(points.map(function (d) { return d[colorKey]; })) ))
    .range(d3.schemeCategory10);

  if (activePoints && activePoints.length) {
    ctx.globalAlpha = 0.15;
  } else {
    ctx.globalAlpha = 1.0;
  }

  // draw each point
  for (var i = 0; i < points.length; ++i) {
    drawPoint(ctx, points[i], radius, false);
  }

  ctx.globalAlpha = 1.0;

  // draw the "active ones" special
  // draw each point
  if (activePoints && activePoints.length) {
    for (var i$1 = 0; i$1 < activePoints.length; ++i$1) {
      drawPoint(ctx, points[i$1], radius * 2, true);
    }
  }

  ctx.restore();
}

function initializeScales() {
  console.log('sample point:', points[0]);
  var xExtent = d3.extent(points, function (d) { return getX(d); });
  var yExtent = d3.extent(points, function (d) { return getY(d); });

  var scale = 1;
  xScale = d3
    .scaleLinear()
    .domain(xExtent)
    .range([0, plotAreaWidth]);
  yScale = d3
    .scaleLinear()
    .domain(yExtent)
    .range([0, plotAreaHeight]);
}

function highlight(point) {
  highlightedPoint = point;
  if (point) {
    activePoint = point;
    displayPoint(point, false);
  }
}

function initializeVoronoi() {
  var voronoiPoints =
    activePoints && activePoints.length ? activePoints : points;
  try {
    voronoiDiagram = d3
      .voronoi()
      .x(function (d) { return xScale(getX(d)) + Math.random() / 100; })
      .y(function (d) { return yScale(getY(d)) + Math.random() / 100; })(voronoiPoints);
  } catch (e) {
    console.error('Error running voronoi', e);
    canvas.on('mousemove', null);
    voronoiDiagram = null;
    return;
  }

  var voronoiRadius = plotAreaWidth / 10;

  canvas
    .on('mousemove', function mouseMoveHandler() {
      // get the current mouse position
      var ref = d3.mouse(this);
      var mx = transform.invertX(ref[0] - padding.left);
      var my = transform.invertY(ref[1] - padding.top);

      // use the new diagram.find() function to find the voronoi site closest to
      // the mouse, limited by max distance defined by voronoiRadius
      var site = voronoiDiagram.find(mx, my, voronoiRadius);

      // debugVoronoi();
      // highlight the point if we found one, otherwise hide the highlight circle
      highlight(site && site.data);
    })
    .on('mouseleave', function() {
      // hide the highlight circle when the mouse leaves the chart
      highlight(null);
    });
}

function debugVoronoi() {
  var g = d3
    .select('body')
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .style('pointer-events', 'none')
    .style('position', 'absolute')
    .style('top', 0)
    .style('left', 0)
    .append('g')
    .attr('transform', 'translate(' + padding.left + ' ' + padding.top + ')');

  var voronoiPolygons = g
    .append('g')
    .attr('class', 'voronoi-polygons')
    .style('pointer-events', 'none');

  var binding = voronoiPolygons
    .selectAll('path')
    .data(voronoiDiagram.polygons());
  binding
    .enter()
    .append('path')
    .style('stroke', 'tomato')
    .style('fill', 'none')
    .style('opacity', 0.15)
    .attr('d', function(d) {
      if (d) {
        return 'M' + d.join('L') + 'Z';
      }
      return null;
    });
}

function applyFilters() {
  var filteredPoints = points;

  if (filters.search) {
    filteredPoints = filterPointsBySubstring(filters.search, filteredPoints);
  }

  if (filteredPoints.length === points.length) {
    activePoints = undefined;
  } else {
    activePoints = filteredPoints;
  }

  initializeVoronoi();
}

function filterPointsBySubstring(substring, points) {
  return points.filter(function (point) { return checkSubstringMatch(point, substring); });
}

function setupControls() {
  d3.select('#substring-search').on('change', function() {
    var safeValue = this.value.trim();
    if (safeValue === '') {
      safeValue = undefined;
    }
    filters.search = safeValue;

    applyFilters();
    render();
  });
}

var transform = d3.zoomIdentity;
// .translate(plotAreaWidth / 2, plotAreaHeight / 2)
// .scale(0.5);
var zoom = d3.zoom();
canvas.call(zoom).call(zoom.transform, transform);

zoom.on('zoom', handleZoom);

function handleZoom() {
  transform = d3.event.transform;
  render();
  // zoom.transform(gZoom);
  // gZoom.call(zoom.transform)
}

function linkifyText(text) {
  return text
    .split(' ')
    .map(function (token) {
      if (
        token.match(/((^|\s|\b)(#|@).+?(\b|$)|(^|\s)http(s?):\/\/.+?(\s|$))/)
      ) {
        return ("<a href=\"#\">" + token + "</a>");
      }
      return token;
    })
    .join(' ');
}

function loadedData(error, data) {
  d3.select('.loading').remove();
  allData = data;
  console.log('Loaded data', allData);
  points = getPointsFromData(data);
  initializeScales();
  initializeVoronoi();

  // applyFilters();
  setupControls();
  render();
}

// load the data
var dataFile = 'data/my_data.json';
var rootUrl = "" + (window.location.origin) + (window.location.pathname);
var dataUrl = rootUrl + "/" + dataFile;

console.log(("Loading data from " + dataFile), rootUrl, dataUrl);
d3.queue()
  .defer(d3.json, dataUrl)
  .await(loadedData);

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlzdF9zY3JpcHQuanMiLCJzb3VyY2VzIjpbInNjcmlwdC5qcy0xNTM3MzE5NDE1ODY0Il0sInNvdXJjZXNDb250ZW50IjpbImxldCBwb2ludHM7XG5sZXQgYWxsRGF0YTtcbmxldCBhY3RpdmVQb2ludHM7XG5jb25zdCBkaXNwbGF5ZWRQb2ludE5vZGUgPSBkMy5zZWxlY3QoJy5kaXNwbGF5ZWQtcG9pbnQnKTtcbmxldCBoaWdobGlnaHRlZFBvaW50O1xubGV0IGFjdGl2ZVBvaW50O1xuXG5sZXQgeFNjYWxlO1xubGV0IHlTY2FsZTtcbmxldCBjb2xvclNjYWxlO1xubGV0IHZvcm9ub2lEaWFncmFtO1xuXG5jb25zdCByYWRpdXMgPSA0O1xuY29uc3QgZ2xvdyA9IHRydWU7XG5cbi8qKiBDb25maWd1cmF0aW9uIGZvciByZWFkaW5nIGZyb20gcG9pbnRzICAqL1xubGV0IGNvbG9yS2V5ID0gJ2NsdXN0ZXInO1xuXG5mdW5jdGlvbiBnZXRQb2ludHNGcm9tRGF0YShkYXRhKSB7XG4gIHJldHVybiBkYXRhLnBvaW50cztcbn1cblxuZnVuY3Rpb24gZ2V0WChwb2ludCkge1xuICByZXR1cm4gcG9pbnQucG9zaXRpb25bMF07XG59XG5cbmZ1bmN0aW9uIGdldFkocG9pbnQpIHtcbiAgcmV0dXJuIHBvaW50LnBvc2l0aW9uWzFdO1xufVxuXG5mdW5jdGlvbiBnZXRIdG1sKHBvaW50KSB7XG4gIC8vIHJldHVybiBKU09OLnN0cmluZ2lmeShwb2ludCk7XG4gIGNvbnN0IGh0bWwgPSBPYmplY3Qua2V5cyhwb2ludClcbiAgICAubWFwKFxuICAgICAga2V5ID0+XG4gICAgICAgIGA8ZGl2IGNsYXNzPSdwb2ludC1wcm9wJz5cbiAgICAgICAgICA8ZGl2IGNsYXNzPSdwb2ludC1wcm9wLWxhYmVsJz4ke2tleX08L2Rpdj5cbiAgICAgICAgICA8ZGl2IGNsYXNzPSdwb2ludC1wcm9wLXZhbHVlJz4ke3BvaW50W2tleV19PC9kaXY+XG4gICAgICAgIDwvZGl2PmBcbiAgICApXG4gICAgLmpvaW4oJ1xcbicpO1xuXG4gIHJldHVybiBodG1sO1xufVxuXG4vLyB1c2VkIHdoZW4gZmlsdGVyaW5nIHZpYSBzZWFyY2ggdG8gc2VlIGlmIGEgcG9pbnQgbWF0Y2hlcyB0aGVcbi8vIGVudGVyZWQgc3RyaW5nXG5mdW5jdGlvbiBjaGVja1N1YnN0cmluZ01hdGNoKHBvaW50LCBzdWJzdHJpbmcpIHtcbiAgY29uc3QgcG9pbnRTdHJpbmcgPSBKU09OLnN0cmluZ2lmeShwb2ludCkudG9Mb3dlckNhc2UoKTtcbiAgcmV0dXJuIHBvaW50U3RyaW5nLmluY2x1ZGVzKHN1YnN0cmluZy50b0xvd2VyQ2FzZSgpKTtcbn1cblxuLyoqIGVuZCBjb25maWd1cmF0aW9uICovXG5cbmNvbnN0IGZpbHRlcnMgPSB7XG4gIHNlYXJjaDogdW5kZWZpbmVkLFxufTtcblxuY29uc3QgcXVlcnlQYXJhbXMgPSB3aW5kb3cubG9jYXRpb24uc2VhcmNoXG4gIC5zdWJzdHJpbmcoMSlcbiAgLnNwbGl0KCcmJylcbiAgLmZpbHRlcihkID0+IGQgIT0gJycpXG4gIC5yZWR1Y2UoKHBhcmFtcywgcGFyYW0pID0+IHtcbiAgICBjb25zdCBlbnRyeSA9IHBhcmFtLnNwbGl0KCc9Jyk7XG4gICAgcGFyYW1zW2VudHJ5WzBdXSA9IGVudHJ5WzFdO1xuICAgIHJldHVybiBwYXJhbXM7XG4gIH0sIHt9KTtcblxuY29uc29sZS5sb2coJ3VybCBxdWVyeSBwYXJhbXMnLCBxdWVyeVBhcmFtcyk7XG5cbi8qKiBJbml0aWFsaXplIENhbnZhcyAqL1xuY29uc3Qgd2lkdGggPSB3aW5kb3cuaW5uZXJXaWR0aDtcbmNvbnN0IGhlaWdodCA9IHdpbmRvdy5pbm5lckhlaWdodDtcbmNvbnN0IHBhZGRpbmcgPSB7IHRvcDogMTAwLCByaWdodDogNDAsIGJvdHRvbTogNDAsIGxlZnQ6IDQwIH07XG5jb25zdCBwbG90QXJlYVdpZHRoID0gd2lkdGggLSBwYWRkaW5nLmxlZnQgLSBwYWRkaW5nLnJpZ2h0O1xuY29uc3QgcGxvdEFyZWFIZWlnaHQgPSBoZWlnaHQgLSBwYWRkaW5nLnRvcCAtIHBhZGRpbmcuYm90dG9tO1xuXG5jb25zdCBzY3JlZW5TY2FsZSA9IHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvIHx8IDE7XG5jb25zdCBjYW52YXMgPSBkM1xuICAuc2VsZWN0KCcjbWFpbi1jYW52YXMnKVxuICAuYXR0cignd2lkdGgnLCB3aWR0aCAqIHNjcmVlblNjYWxlKVxuICAuYXR0cignaGVpZ2h0JywgaGVpZ2h0ICogc2NyZWVuU2NhbGUpXG4gIC5zdHlsZSgnd2lkdGgnLCBgJHt3aWR0aH1weGApXG4gIC5zdHlsZSgnaGVpZ2h0JywgYCR7aGVpZ2h0fXB4YCk7XG5jYW52YXNcbiAgLm5vZGUoKVxuICAuZ2V0Q29udGV4dCgnMmQnKVxuICAuc2NhbGUoc2NyZWVuU2NhbGUsIHNjcmVlblNjYWxlKTtcblxuLyoqIEluaXRpYWxpemUgaGlnaGxpZ2h0IFNWRyAqL1xuY29uc3QgaGlnaGxpZ2h0U3ZnID0gZDNcbiAgLnNlbGVjdCgnI2hpZ2hsaWdodC1zdmcnKVxuICAuYXR0cignd2lkdGgnLCB3aWR0aClcbiAgLmF0dHIoJ2hlaWdodCcsIGhlaWdodCk7XG5oaWdobGlnaHRTdmcuc2VsZWN0QWxsKCcqJykucmVtb3ZlKCk7XG5cbmNvbnN0IGhpZ2hsaWdodEcgPSBoaWdobGlnaHRTdmdcbiAgLmFwcGVuZCgnZycpXG4gIC5hdHRyKCd0cmFuc2Zvcm0nLCAndHJhbnNsYXRlKCcgKyBwYWRkaW5nLmxlZnQgKyAnICcgKyBwYWRkaW5nLnRvcCArICcpJyk7XG5cbmNvbnN0IGdab29tID0gaGlnaGxpZ2h0Ry5hcHBlbmQoJ2cnKTtcblxuY29uc3QgaGlnaGxpZ2h0UG9pbnROb2RlID0gZ1pvb21cbiAgLmFwcGVuZCgnZycpXG4gIC5hdHRyKCdjbGFzcycsICdwb2ludCcpXG4gIC5zdHlsZSgnb3BhY2l0eScsIDApO1xuXG5oaWdobGlnaHRQb2ludE5vZGVcbiAgLmFwcGVuZCgnY2lyY2xlJylcbiAgLmF0dHIoJ3InLCAxNSlcbiAgLmF0dHIoJ2NsYXNzJywgJ2hpZ2hsaWdodC1wb2ludC1jaXJjbGUnKVxuICAuYXR0cignc3Ryb2tlJywgJyMwMDAnKVxuICAuYXR0cignc3Ryb2tlLXdpZHRoJywgMylcbiAgLmF0dHIoJ2ZpbGwnLCAnI2ZmZicpXG4gIC5hdHRyKCdmaWxsLW9wYWNpdHknLCAwLjEpO1xuXG5mdW5jdGlvbiBkaXNwbGF5UG9pbnQocG9pbnQsIGZhZGUpIHtcbiAgY29uc3QgdGV4dCA9IHBvaW50LmNvbnRlbnQ7XG4gIGNvbnN0IGRpc3BsYXlIdG1sID0gZ2V0SHRtbChwb2ludCk7XG5cbiAgZGlzcGxheWVkUG9pbnROb2RlLnN0eWxlKCdvcGFjaXR5JywgMSkuaHRtbChkaXNwbGF5SHRtbCk7XG5cbiAgaGlnaGxpZ2h0UG9pbnROb2RlXG4gICAgLnN0eWxlKCdvcGFjaXR5JywgMSlcbiAgICAuYXR0cihcbiAgICAgICd0cmFuc2Zvcm0nLFxuICAgICAgYHRyYW5zbGF0ZSgke3hTY2FsZShnZXRYKHBvaW50KSl9LCAke3lTY2FsZShnZXRZKHBvaW50KSl9KWBcbiAgICApO1xufVxuXG5mdW5jdGlvbiBkcmF3UG9pbnQoY3R4LCBwb2ludCwgcmFkaXVzLCBzdHJva2UpIHtcbiAgY29uc3QgeCA9IHhTY2FsZShnZXRYKHBvaW50KSk7XG4gIGNvbnN0IHkgPSB5U2NhbGUoZ2V0WShwb2ludCkpO1xuXG4gIGxldCBjb2xvciA9IGQzLmNvbG9yKGNvbG9yU2NhbGUocG9pbnRbY29sb3JLZXldKSk7XG5cbiAgLy8gZHJhdyBnbG93eSBncmFkaWVudFxuICBpZiAoZ2xvdykge1xuICAgIGNvbnN0IGdyYWRpZW50UmFkaXVzID0gcmFkaXVzICogODtcbiAgICB2YXIgZ3JkID0gY3R4LmNyZWF0ZVJhZGlhbEdyYWRpZW50KHgsIHksIHJhZGl1cywgeCwgeSwgZ3JhZGllbnRSYWRpdXMpO1xuICAgIGdyZC5hZGRDb2xvclN0b3AoMCwgYHJnYmEoJHtjb2xvci5yfSwgJHtjb2xvci5nfSwgJHtjb2xvci5ifSwgMC4zKWApO1xuICAgIGdyZC5hZGRDb2xvclN0b3AoMC4zLCBgcmdiYSgke2NvbG9yLnJ9LCAke2NvbG9yLmd9LCAke2NvbG9yLmJ9LCAwLjAzKWApO1xuICAgIGdyZC5hZGRDb2xvclN0b3AoMSwgYHJnYmEoJHtjb2xvci5yfSwgJHtjb2xvci5nfSwgJHtjb2xvci5ifSwgMClgKTtcbiAgICBjdHguZmlsbFN0eWxlID0gZ3JkO1xuICAgIGN0eC5maWxsUmVjdChcbiAgICAgIHggLSBncmFkaWVudFJhZGl1cyxcbiAgICAgIHkgLSBncmFkaWVudFJhZGl1cyxcbiAgICAgIGdyYWRpZW50UmFkaXVzICogMixcbiAgICAgIGdyYWRpZW50UmFkaXVzICogMlxuICAgICk7XG4gIH1cblxuICAvLyBkcmF3IGNvcmUgY2lyY2xlXG4gIGN0eC5maWxsU3R5bGUgPSBjb2xvci50b1N0cmluZygpO1xuICBjdHguYmVnaW5QYXRoKCk7XG4gIGN0eC5hcmMoeCwgeSwgcmFkaXVzLCAwLCAyICogTWF0aC5QSSk7XG4gIGN0eC5maWxsKCk7XG5cbiAgaWYgKHN0cm9rZSkge1xuICAgIGN0eC5zdHJva2VTdHlsZSA9ICdyZ2JhKDAsIDAsIDAsIDAuNSknO1xuICAgIGN0eC5saW5lV2lkdGggPSAyO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiByZW5kZXIoKSB7XG4gIC8vIGNvbnNvbGUud2FybignUkVOREVSJywgdHJhbnNmb3JtKTtcbiAgLy8gdXBkYXRlIHRoZSBoaWdobGlnaHQgdHJhbnNmb3JtXG4gIGdab29tLmF0dHIoJ3RyYW5zZm9ybScsIHRyYW5zZm9ybSk7XG5cbiAgY29uc3QgY3R4ID0gY2FudmFzLm5vZGUoKS5nZXRDb250ZXh0KCcyZCcpO1xuICBjdHguc2F2ZSgpO1xuXG4gIC8vIGVyYXNlIHdoYXQgaXMgb24gdGhlIGNhbnZhcyBjdXJyZW50bHlcbiAgY3R4LmNsZWFyUmVjdCgwLCAwLCB3aWR0aCwgaGVpZ2h0KTtcbiAgY3R4Lmdsb2JhbEFscGhhID0gMC44O1xuXG4gIGN0eC50cmFuc2xhdGUocGFkZGluZy5sZWZ0LCBwYWRkaW5nLnRvcCk7XG5cbiAgLy8gYXBwbHkgem9vbSB0cmFuc2Zvcm1cbiAgY3R4LnRyYW5zbGF0ZSh0cmFuc2Zvcm0ueCwgdHJhbnNmb3JtLnkpO1xuICBjdHguc2NhbGUodHJhbnNmb3JtLmssIHRyYW5zZm9ybS5rKTtcblxuICBjb2xvclNjYWxlID0gZDNcbiAgICAuc2NhbGVPcmRpbmFsKClcbiAgICAuZG9tYWluKFsuLi5uZXcgU2V0KHBvaW50cy5tYXAoZCA9PiBkW2NvbG9yS2V5XSkpXSlcbiAgICAucmFuZ2UoZDMuc2NoZW1lQ2F0ZWdvcnkxMCk7XG5cbiAgaWYgKGFjdGl2ZVBvaW50cyAmJiBhY3RpdmVQb2ludHMubGVuZ3RoKSB7XG4gICAgY3R4Lmdsb2JhbEFscGhhID0gMC4xNTtcbiAgfSBlbHNlIHtcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSAxLjA7XG4gIH1cblxuICAvLyBkcmF3IGVhY2ggcG9pbnRcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBwb2ludHMubGVuZ3RoOyArK2kpIHtcbiAgICBkcmF3UG9pbnQoY3R4LCBwb2ludHNbaV0sIHJhZGl1cywgZmFsc2UpO1xuICB9XG5cbiAgY3R4Lmdsb2JhbEFscGhhID0gMS4wO1xuXG4gIC8vIGRyYXcgdGhlIFwiYWN0aXZlIG9uZXNcIiBzcGVjaWFsXG4gIC8vIGRyYXcgZWFjaCBwb2ludFxuICBpZiAoYWN0aXZlUG9pbnRzICYmIGFjdGl2ZVBvaW50cy5sZW5ndGgpIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFjdGl2ZVBvaW50cy5sZW5ndGg7ICsraSkge1xuICAgICAgZHJhd1BvaW50KGN0eCwgcG9pbnRzW2ldLCByYWRpdXMgKiAyLCB0cnVlKTtcbiAgICB9XG4gIH1cblxuICBjdHgucmVzdG9yZSgpO1xufVxuXG5mdW5jdGlvbiBpbml0aWFsaXplU2NhbGVzKCkge1xuICBjb25zb2xlLmxvZygnc2FtcGxlIHBvaW50OicsIHBvaW50c1swXSk7XG4gIGNvbnN0IHhFeHRlbnQgPSBkMy5leHRlbnQocG9pbnRzLCBkID0+IGdldFgoZCkpO1xuICBjb25zdCB5RXh0ZW50ID0gZDMuZXh0ZW50KHBvaW50cywgZCA9PiBnZXRZKGQpKTtcblxuICBjb25zdCBzY2FsZSA9IDE7XG4gIHhTY2FsZSA9IGQzXG4gICAgLnNjYWxlTGluZWFyKClcbiAgICAuZG9tYWluKHhFeHRlbnQpXG4gICAgLnJhbmdlKFswLCBwbG90QXJlYVdpZHRoXSk7XG4gIHlTY2FsZSA9IGQzXG4gICAgLnNjYWxlTGluZWFyKClcbiAgICAuZG9tYWluKHlFeHRlbnQpXG4gICAgLnJhbmdlKFswLCBwbG90QXJlYUhlaWdodF0pO1xufVxuXG5mdW5jdGlvbiBoaWdobGlnaHQocG9pbnQpIHtcbiAgaGlnaGxpZ2h0ZWRQb2ludCA9IHBvaW50O1xuICBpZiAocG9pbnQpIHtcbiAgICBhY3RpdmVQb2ludCA9IHBvaW50O1xuICAgIGRpc3BsYXlQb2ludChwb2ludCwgZmFsc2UpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGluaXRpYWxpemVWb3Jvbm9pKCkge1xuICBjb25zdCB2b3Jvbm9pUG9pbnRzID1cbiAgICBhY3RpdmVQb2ludHMgJiYgYWN0aXZlUG9pbnRzLmxlbmd0aCA/IGFjdGl2ZVBvaW50cyA6IHBvaW50cztcbiAgdHJ5IHtcbiAgICB2b3Jvbm9pRGlhZ3JhbSA9IGQzXG4gICAgICAudm9yb25vaSgpXG4gICAgICAueChkID0+IHhTY2FsZShnZXRYKGQpKSArIE1hdGgucmFuZG9tKCkgLyAxMDApXG4gICAgICAueShkID0+IHlTY2FsZShnZXRZKGQpKSArIE1hdGgucmFuZG9tKCkgLyAxMDApKHZvcm9ub2lQb2ludHMpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgcnVubmluZyB2b3Jvbm9pJywgZSk7XG4gICAgY2FudmFzLm9uKCdtb3VzZW1vdmUnLCBudWxsKTtcbiAgICB2b3Jvbm9pRGlhZ3JhbSA9IG51bGw7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3Qgdm9yb25vaVJhZGl1cyA9IHBsb3RBcmVhV2lkdGggLyAxMDtcblxuICBjYW52YXNcbiAgICAub24oJ21vdXNlbW92ZScsIGZ1bmN0aW9uIG1vdXNlTW92ZUhhbmRsZXIoKSB7XG4gICAgICAvLyBnZXQgdGhlIGN1cnJlbnQgbW91c2UgcG9zaXRpb25cbiAgICAgIHZhciByZWYgPSBkMy5tb3VzZSh0aGlzKTtcbiAgICAgIHZhciBteCA9IHRyYW5zZm9ybS5pbnZlcnRYKHJlZlswXSAtIHBhZGRpbmcubGVmdCk7XG4gICAgICB2YXIgbXkgPSB0cmFuc2Zvcm0uaW52ZXJ0WShyZWZbMV0gLSBwYWRkaW5nLnRvcCk7XG5cbiAgICAgIC8vIHVzZSB0aGUgbmV3IGRpYWdyYW0uZmluZCgpIGZ1bmN0aW9uIHRvIGZpbmQgdGhlIHZvcm9ub2kgc2l0ZSBjbG9zZXN0IHRvXG4gICAgICAvLyB0aGUgbW91c2UsIGxpbWl0ZWQgYnkgbWF4IGRpc3RhbmNlIGRlZmluZWQgYnkgdm9yb25vaVJhZGl1c1xuICAgICAgdmFyIHNpdGUgPSB2b3Jvbm9pRGlhZ3JhbS5maW5kKG14LCBteSwgdm9yb25vaVJhZGl1cyk7XG5cbiAgICAgIC8vIGRlYnVnVm9yb25vaSgpO1xuICAgICAgLy8gaGlnaGxpZ2h0IHRoZSBwb2ludCBpZiB3ZSBmb3VuZCBvbmUsIG90aGVyd2lzZSBoaWRlIHRoZSBoaWdobGlnaHQgY2lyY2xlXG4gICAgICBoaWdobGlnaHQoc2l0ZSAmJiBzaXRlLmRhdGEpO1xuICAgIH0pXG4gICAgLm9uKCdtb3VzZWxlYXZlJywgZnVuY3Rpb24oKSB7XG4gICAgICAvLyBoaWRlIHRoZSBoaWdobGlnaHQgY2lyY2xlIHdoZW4gdGhlIG1vdXNlIGxlYXZlcyB0aGUgY2hhcnRcbiAgICAgIGhpZ2hsaWdodChudWxsKTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gZGVidWdWb3Jvbm9pKCkge1xuICB2YXIgZyA9IGQzXG4gICAgLnNlbGVjdCgnYm9keScpXG4gICAgLmFwcGVuZCgnc3ZnJylcbiAgICAuYXR0cignd2lkdGgnLCB3aWR0aClcbiAgICAuYXR0cignaGVpZ2h0JywgaGVpZ2h0KVxuICAgIC5zdHlsZSgncG9pbnRlci1ldmVudHMnLCAnbm9uZScpXG4gICAgLnN0eWxlKCdwb3NpdGlvbicsICdhYnNvbHV0ZScpXG4gICAgLnN0eWxlKCd0b3AnLCAwKVxuICAgIC5zdHlsZSgnbGVmdCcsIDApXG4gICAgLmFwcGVuZCgnZycpXG4gICAgLmF0dHIoJ3RyYW5zZm9ybScsICd0cmFuc2xhdGUoJyArIHBhZGRpbmcubGVmdCArICcgJyArIHBhZGRpbmcudG9wICsgJyknKTtcblxuICB2YXIgdm9yb25vaVBvbHlnb25zID0gZ1xuICAgIC5hcHBlbmQoJ2cnKVxuICAgIC5hdHRyKCdjbGFzcycsICd2b3Jvbm9pLXBvbHlnb25zJylcbiAgICAuc3R5bGUoJ3BvaW50ZXItZXZlbnRzJywgJ25vbmUnKTtcblxuICB2YXIgYmluZGluZyA9IHZvcm9ub2lQb2x5Z29uc1xuICAgIC5zZWxlY3RBbGwoJ3BhdGgnKVxuICAgIC5kYXRhKHZvcm9ub2lEaWFncmFtLnBvbHlnb25zKCkpO1xuICBiaW5kaW5nXG4gICAgLmVudGVyKClcbiAgICAuYXBwZW5kKCdwYXRoJylcbiAgICAuc3R5bGUoJ3N0cm9rZScsICd0b21hdG8nKVxuICAgIC5zdHlsZSgnZmlsbCcsICdub25lJylcbiAgICAuc3R5bGUoJ29wYWNpdHknLCAwLjE1KVxuICAgIC5hdHRyKCdkJywgZnVuY3Rpb24oZCkge1xuICAgICAgaWYgKGQpIHtcbiAgICAgICAgcmV0dXJuICdNJyArIGQuam9pbignTCcpICsgJ1onO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIGFwcGx5RmlsdGVycygpIHtcbiAgbGV0IGZpbHRlcmVkUG9pbnRzID0gcG9pbnRzO1xuXG4gIGlmIChmaWx0ZXJzLnNlYXJjaCkge1xuICAgIGZpbHRlcmVkUG9pbnRzID0gZmlsdGVyUG9pbnRzQnlTdWJzdHJpbmcoZmlsdGVycy5zZWFyY2gsIGZpbHRlcmVkUG9pbnRzKTtcbiAgfVxuXG4gIGlmIChmaWx0ZXJlZFBvaW50cy5sZW5ndGggPT09IHBvaW50cy5sZW5ndGgpIHtcbiAgICBhY3RpdmVQb2ludHMgPSB1bmRlZmluZWQ7XG4gIH0gZWxzZSB7XG4gICAgYWN0aXZlUG9pbnRzID0gZmlsdGVyZWRQb2ludHM7XG4gIH1cblxuICBpbml0aWFsaXplVm9yb25vaSgpO1xufVxuXG5mdW5jdGlvbiBmaWx0ZXJQb2ludHNCeVN1YnN0cmluZyhzdWJzdHJpbmcsIHBvaW50cykge1xuICByZXR1cm4gcG9pbnRzLmZpbHRlcihwb2ludCA9PiBjaGVja1N1YnN0cmluZ01hdGNoKHBvaW50LCBzdWJzdHJpbmcpKTtcbn1cblxuZnVuY3Rpb24gc2V0dXBDb250cm9scygpIHtcbiAgZDMuc2VsZWN0KCcjc3Vic3RyaW5nLXNlYXJjaCcpLm9uKCdjaGFuZ2UnLCBmdW5jdGlvbigpIHtcbiAgICBsZXQgc2FmZVZhbHVlID0gdGhpcy52YWx1ZS50cmltKCk7XG4gICAgaWYgKHNhZmVWYWx1ZSA9PT0gJycpIHtcbiAgICAgIHNhZmVWYWx1ZSA9IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgZmlsdGVycy5zZWFyY2ggPSBzYWZlVmFsdWU7XG5cbiAgICBhcHBseUZpbHRlcnMoKTtcbiAgICByZW5kZXIoKTtcbiAgfSk7XG59XG5cbmxldCB0cmFuc2Zvcm0gPSBkMy56b29tSWRlbnRpdHk7XG4vLyAudHJhbnNsYXRlKHBsb3RBcmVhV2lkdGggLyAyLCBwbG90QXJlYUhlaWdodCAvIDIpXG4vLyAuc2NhbGUoMC41KTtcbmNvbnN0IHpvb20gPSBkMy56b29tKCk7XG5jYW52YXMuY2FsbCh6b29tKS5jYWxsKHpvb20udHJhbnNmb3JtLCB0cmFuc2Zvcm0pO1xuXG56b29tLm9uKCd6b29tJywgaGFuZGxlWm9vbSk7XG5cbmZ1bmN0aW9uIGhhbmRsZVpvb20oKSB7XG4gIHRyYW5zZm9ybSA9IGQzLmV2ZW50LnRyYW5zZm9ybTtcbiAgcmVuZGVyKCk7XG4gIC8vIHpvb20udHJhbnNmb3JtKGdab29tKTtcbiAgLy8gZ1pvb20uY2FsbCh6b29tLnRyYW5zZm9ybSlcbn1cblxuZnVuY3Rpb24gbGlua2lmeVRleHQodGV4dCkge1xuICByZXR1cm4gdGV4dFxuICAgIC5zcGxpdCgnICcpXG4gICAgLm1hcCh0b2tlbiA9PiB7XG4gICAgICBpZiAoXG4gICAgICAgIHRva2VuLm1hdGNoKC8oKF58XFxzfFxcYikoI3xAKS4rPyhcXGJ8JCl8KF58XFxzKWh0dHAocz8pOlxcL1xcLy4rPyhcXHN8JCkpLylcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gYDxhIGhyZWY9XCIjXCI+JHt0b2tlbn08L2E+YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0b2tlbjtcbiAgICB9KVxuICAgIC5qb2luKCcgJyk7XG59XG5cbmZ1bmN0aW9uIGxvYWRlZERhdGEoZXJyb3IsIGRhdGEpIHtcbiAgZDMuc2VsZWN0KCcubG9hZGluZycpLnJlbW92ZSgpO1xuICBhbGxEYXRhID0gZGF0YTtcbiAgY29uc29sZS5sb2coJ0xvYWRlZCBkYXRhJywgYWxsRGF0YSk7XG4gIHBvaW50cyA9IGdldFBvaW50c0Zyb21EYXRhKGRhdGEpO1xuICBpbml0aWFsaXplU2NhbGVzKCk7XG4gIGluaXRpYWxpemVWb3Jvbm9pKCk7XG5cbiAgLy8gYXBwbHlGaWx0ZXJzKCk7XG4gIHNldHVwQ29udHJvbHMoKTtcbiAgcmVuZGVyKCk7XG59XG5cbi8vIGxvYWQgdGhlIGRhdGFcbmNvbnN0IGRhdGFGaWxlID0gJ2RhdGEvbXlfZGF0YS5qc29uJztcbmNvbnN0IHJvb3RVcmwgPSBgJHt3aW5kb3cubG9jYXRpb24ub3JpZ2lufSR7d2luZG93LmxvY2F0aW9uLnBhdGhuYW1lfWA7XG5jb25zdCBkYXRhVXJsID0gYCR7cm9vdFVybH0vJHtkYXRhRmlsZX1gO1xuXG5jb25zb2xlLmxvZyhgTG9hZGluZyBkYXRhIGZyb20gJHtkYXRhRmlsZX1gLCByb290VXJsLCBkYXRhVXJsKTtcbmQzLnF1ZXVlKClcbiAgLmRlZmVyKGQzLmpzb24sIGRhdGFVcmwpXG4gIC5hd2FpdChsb2FkZWREYXRhKTtcbiJd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