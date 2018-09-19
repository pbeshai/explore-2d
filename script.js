let points;
let allData;
let activePoints;
const displayedPointNode = d3.select('.displayed-point');
let highlightedPoint;
let activePoint;

let xScale;
let yScale;
let colorScale;
let voronoiDiagram;

const radius = 4;
const glow = true;

/** Configuration for reading from points  */
let colorKey = 'cluster';

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
  const html = Object.keys(point)
    .map(
      key =>
        `<div class='point-prop'>
          <div class='point-prop-label'>${key}</div>
          <div class='point-prop-value'>${point[key]}</div>
        </div>`
    )
    .join('\n');

  return html;
}

// used when filtering via search to see if a point matches the
// entered string
function checkSubstringMatch(point, substring) {
  const pointString = JSON.stringify(point).toLowerCase();
  return pointString.includes(substring.toLowerCase());
}

/** end configuration */

const filters = {
  search: undefined,
};

const queryParams = window.location.search
  .substring(1)
  .split('&')
  .filter(d => d != '')
  .reduce((params, param) => {
    const entry = param.split('=');
    params[entry[0]] = entry[1];
    return params;
  }, {});

console.log('url query params', queryParams);

/** Initialize Canvas */
const width = window.innerWidth;
const height = window.innerHeight;
const padding = { top: 100, right: 40, bottom: 40, left: 40 };
const plotAreaWidth = width - padding.left - padding.right;
const plotAreaHeight = height - padding.top - padding.bottom;

const screenScale = window.devicePixelRatio || 1;
const canvas = d3
  .select('#main-canvas')
  .attr('width', width * screenScale)
  .attr('height', height * screenScale)
  .style('width', `${width}px`)
  .style('height', `${height}px`);
canvas
  .node()
  .getContext('2d')
  .scale(screenScale, screenScale);

/** Initialize highlight SVG */
const highlightSvg = d3
  .select('#highlight-svg')
  .attr('width', width)
  .attr('height', height);
highlightSvg.selectAll('*').remove();

const highlightG = highlightSvg
  .append('g')
  .attr('transform', 'translate(' + padding.left + ' ' + padding.top + ')');

const gZoom = highlightG.append('g');

const highlightPointNode = gZoom
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
  const text = point.content;
  const displayHtml = getHtml(point);

  displayedPointNode.style('opacity', 1).html(displayHtml);

  highlightPointNode
    .style('opacity', 1)
    .attr(
      'transform',
      `translate(${xScale(getX(point))}, ${yScale(getY(point))})`
    );
}

function drawPoint(ctx, point, radius, stroke) {
  const x = xScale(getX(point));
  const y = yScale(getY(point));

  let color = d3.color(colorScale(point[colorKey]));

  // draw glowy gradient
  if (glow) {
    const gradientRadius = radius * 8;
    var grd = ctx.createRadialGradient(x, y, radius, x, y, gradientRadius);
    grd.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, 0.3)`);
    grd.addColorStop(0.3, `rgba(${color.r}, ${color.g}, ${color.b}, 0.03)`);
    grd.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
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

  const ctx = canvas.node().getContext('2d');
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
    .domain([...new Set(points.map(d => d[colorKey]))])
    .range(d3.schemeCategory10);

  if (activePoints && activePoints.length) {
    ctx.globalAlpha = 0.15;
  } else {
    ctx.globalAlpha = 1.0;
  }

  // draw each point
  for (let i = 0; i < points.length; ++i) {
    drawPoint(ctx, points[i], radius, false);
  }

  ctx.globalAlpha = 1.0;

  // draw the "active ones" special
  // draw each point
  if (activePoints && activePoints.length) {
    for (let i = 0; i < activePoints.length; ++i) {
      drawPoint(ctx, points[i], radius * 2, true);
    }
  }

  ctx.restore();
}

function initializeScales() {
  console.log('sample point:', points[0]);
  const xExtent = d3.extent(points, d => getX(d));
  const yExtent = d3.extent(points, d => getY(d));

  const scale = 1;
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
  const voronoiPoints =
    activePoints && activePoints.length ? activePoints : points;
  try {
    voronoiDiagram = d3
      .voronoi()
      .x(d => xScale(getX(d)) + Math.random() / 100)
      .y(d => yScale(getY(d)) + Math.random() / 100)(voronoiPoints);
  } catch (e) {
    console.error('Error running voronoi', e);
    canvas.on('mousemove', null);
    voronoiDiagram = null;
    return;
  }

  const voronoiRadius = plotAreaWidth / 10;

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
  let filteredPoints = points;

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
  return points.filter(point => checkSubstringMatch(point, substring));
}

function setupControls() {
  d3.select('#substring-search').on('change', function() {
    let safeValue = this.value.trim();
    if (safeValue === '') {
      safeValue = undefined;
    }
    filters.search = safeValue;

    applyFilters();
    render();
  });
}

let transform = d3.zoomIdentity;
// .translate(plotAreaWidth / 2, plotAreaHeight / 2)
// .scale(0.5);
const zoom = d3.zoom();
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
    .map(token => {
      if (
        token.match(/((^|\s|\b)(#|@).+?(\b|$)|(^|\s)http(s?):\/\/.+?(\s|$))/)
      ) {
        return `<a href="#">${token}</a>`;
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
const dataFile = 'data/my_data.json';
const rootUrl = `${window.location.origin}${window.location.pathname}`;
const dataUrl = `${rootUrl}/${dataFile}`;

console.log(`Loading data from ${dataFile}`, rootUrl, dataUrl);
d3.queue()
  .defer(d3.json, dataUrl)
  .await(loadedData);
