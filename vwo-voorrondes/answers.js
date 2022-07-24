/* global pdfjsLib, $, google */
/* eslint-disable no-unused-vars */
var answers;
var versions = {};
var allData = [];
var blankDefault = "X";
var blank = "X*?/ \\.";
var chartData;
var chartOptions;
var cutoffs;
var currentYear = (new Date()).getFullYear();
var fragments;
var links;
var prevInputs = [];
var prevCursors = [];
var prevKeyDowns = [];
var replaceThreshold = 70;
var startYearV = 1986;
var suggestionThreshold = 65;

chartOptions = {
    legend: {textStyle: {color: '#afbac4'}},
    hAxis: {
        title: "Jaar",
        format: "0000",
        minValue: startYearV - 1,
        maxValue: currentYear + 1,
        ticks: range(startYearV, currentYear+1, 2),
        //gridlines: {count: 2},
        gridlineColor: '#2e353b',
        titleTextStyle: {
          color: "white",
          fontSize: "17"
        },
        textStyle:{
          color: "#afbac4"
        },
        minorGridlines:{color:'#2e353b'},
        baselineColor: "#2e353b"
    },
    vAxis: {
        title: "Cesuur",
        minValue: 70,
        maxValue: 130,
        gridlines: {
            count: 10,
            color: "#2e353b"
        },
        titleTextStyle: {
          color: "white",
          fontSize: "17"
        },
        textStyle:{
          color: "#afbac4"
        },
        minorGridlines:{color:'#2e353b'},
        baselineColor: "#2e353b"
        //viewWindowMode: "pretty",
    },
    pointSize: 2,
    explorer: {
        axis: "horizontal",
        keepInBounds: true,
        maxZoomIn: 0.25,
        maxZoomOut: 1,
        zoomDelta: 2,
    },
    series: {
        // JWO: D53500
        // VWO: 003973
        0: {
            color: "#f52762"
        },
        1: {
            color: "#ebe721"
        },
        2: {
            color: "#43a147"
        },
        3: {
            color: "#a42ac9"
        },
    },
    backgroundColor: {
      fill: "transparent"
    },
    tooltip: {
      isHtml: true
    },
    focusTarget: 'category'

};

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.6.347/pdf.worker.min.js";

google.charts.load("current", {
    packages: ["corechart", "line"]
});



$(window).resize(function() {
    if (this.resizeTO) clearTimeout(this.resizeTO);
    this.resizeTO = setTimeout(function() {
        $(this).trigger('resizeEnd');
    }, 500);
});

$(window).on('resizeEnd', drawChart);

$(document).ready(function() {
    createYearsList();
    createAnswerFields();
    loadData();
    addListeners();
});

function addListeners() {
    $("#clear").click(emptyInput);
    $("#copyinput").click(copyInputString);
    $("#check").click(checkAnswers);
    $("#showall").click(showAllAnswers);
    $("#hideall").click(hideAllAnswers);
    $("#copycheck").click(copyAnswerString);
    $("#showhidelist").click(showHideList);
    $("select").change(selectChange);
    $("#openpdf").click(openPDF);
    $("#booklet").on("change", event => bookletOnUpload(event));
    $("#booklet2").on("change", event => bookletOnUpload(event, true));
}

function argMax(array, comparator) {
    return array.map((v, i) => ({
        value: v,
        index: i,
    })).reduce((a, b) => (comparator(a.value, b.value) > 0 ? a : b));
}

function arrowKeysMove(element) {
    element.on("keydown", function(e) {
        var k = parseInt(e.keyCode);
        if ([13, 37, 38, 39, 40].indexOf(k) > -1) {
            e.preventDefault();
            var m = (k == 37) ? -1 : (k == 38) ? -10 : (k == 40) ? 10 : 1;
            setFocus(getPos(element) + m);
            if (k == 13 && getPos(element) == 30) {
                checkAnswers();
            }
        } else if (k == 8 && getSelectionCharacterOffsetWithin(element[0]).end == 0) {
            var pos = getPos($(this));
            emptyInputField(pos - 1);
            hideFeedback(getInputField(pos - 1));
            setFocus(pos - 1);
        } else if (k == 8 && getSelectionCharacterOffsetWithin(element[0]).end > 0) {
            pos = getPos($(this));
            emptyInputField(pos);
            hideFeedback(getInputField(pos));
        } else if (k == 46 && getSelectionCharacterOffsetWithin(element[0]).start == 0) {
            pos = getPos($(this));
            emptyInputField(pos);
            hideFeedback(getInputField(pos));
        }
    });
}

function bookletOnUpload(event, fragmentsOnly) {
    var file = event.target.files[0];
    if (!file || file.type != "application/pdf") {
        return;
    }
    $("#booklet-loading").css("dipslay", "inline-block");
    var data = getData();
    var code = dataToCode(data);
    answers[code] = "";
    selectChange();
    var fileReader = new FileReader();
    fileReader.onload = function() {
        var typedarray = new Uint8Array(this.result);
        pdfjsLib.getDocument(typedarray).promise.then(result => parseBooklet(result, fragmentsOnly));
    }
    fileReader.readAsArrayBuffer(file);
}

function checkAnswers() {
    hideFeedback();
    var feedback = {
        5: "correct",
        1: "blank",
        0: "wrong"
    };
    var answers = getCurrentAnswers();
    var input = getInputString();
    var score = 0;
    if (answers) {
        for (var i = 0; i < 30; i++) {
            var grade = (answers[i] == blankDefault) ? 6 : (input[i] == answers[i]) ? 5 : (input[i] == blankDefault) ? 1 : 0;
            score += grade % 6;
            if (grade < 6) {
                $("#inputfield" + (i + 1)).addClass("feedback-" + feedback[grade]);
            }
        }
        var total = 5 * answers.replace(blankDefault, "").length;
        $("#score").html(score + " / " + total);
        $(".score").css("display", "inline-block");
    } else {
        return;
    }
    if (score < suggestionThreshold) {
        let optimized = optimizeData(input);
        if (optimized.score > replaceThreshold) {
            suggestData(optimized.data);
        }
    }
}

function clickShowHide(element) {
    element.on("click", function() {
        showHide(element);
    });
}

function codeToData(code) {
    return {
        year: code.substring(0, 4),
        level: code.substring(4, 7),
        round: code.substring(7, 8),
        version: code.substring(8),
    };
}

function copyAnswerString() {
    copyToClipboard(formatAnswerString(getCurrentAnswers(), "<br>"));
}

function createAnswerFields() {
    var inputline;
    var checkline;
    var inputblock;
    var checkblock;
    for (var i = 1; i <= 30; i++) {
        if (i % 5 == 1) {
            inputblock = $("<span></span>");
            checkblock = $("<span></span>");
            inputblock.addClass("block");
            checkblock.addClass("block");
            if (i % 10 == 1) {
                inputline = $("<div></div>");
                checkline = $("<div></div>");
                inputblock.addClass("block-left");
                checkblock.addClass("block-left");
            } else {
                inputblock.addClass("block-right");
                checkblock.addClass("block-right");
            }
        }
        var inputField = $("<span></span>").attr("id", "inputfield" + i).attr("contenteditable", "true").attr("class", "input-field");
        var checkField = $("<span></span>").attr("id", "checkfield" + i).attr("class", "check-field checkfield-number").html(i);
        restrictEdit(inputField);
        arrowKeysMove(inputField);
        inputField.attr("autocomplete", "off");
        inputField.attr("autocorrect", "off");
        inputField.attr("spellcheck", "false");
        clickShowHide(checkField);
        inputblock.append(inputField);
        checkblock.append(checkField);
        if (i % 5 == 0) {
            inputline.append(inputblock);
            checkline.append(checkblock);
        }
        if (i % 10 == 0) {
            $("#inputfields").append(inputline);
            $("#checkfields").append(checkline);
        }
    }
}

function createYearsList() {
    for (var i = startYearV; i <= currentYear; i++) {
        $("#year").prepend($("<option></option>").attr("value", i).html(yearString(i)));
    }
    $("#year").val(currentYear);
}

function dataToCode(data) {
    return data.year + data.level + data.round + (data.version || "");
}

function drawChart() {
    var chart = new google.visualization.LineChart(document.getElementById("chart_div"));
    chart.draw(chartData, chartOptions);

}

function emptyInput() {
    $("span.input-field").html("");
    hideFeedback();
}

function getAllVersions(data) {
    data.version = "";
    var code = dataToCode(data);
    return versions[code] || [];
}

function getAnswers(data) {
    return answers[dataToCode(data)] || "";
}

function getCurrentAnswers() {
    return getAnswers(getData());
}

function getCurrentCutoff() {
    return getCutoff(getData());
}

function getFragmentsAccordingToText(data, text) {
    var questionPositions = [];
    data.version = "";
    var code = dataToCode(data);
    if (!fragments[code]) {
        return;
    }
    for (var i = 1; i <= 30; i++) {
        let pattern = fragments[code][i];
        questionPositions[i] = sellerSearch(pattern, text).start;
    }
    var indices = Array.from(Array(30).keys());
    indices.sort((i, j) => questionPositions[i + 1] - questionPositions[j + 1]);
    var newFragments = {};
    for (i = 1; i <= 30; i++) {
        newFragments[i] = fragments[code][indices[i - 1] + 1];
    }
    window.console.log(JSON.stringify(newFragments));
}

function getCurrentMainAnswersAccordingToText(text) {
    var data = getData();
    data.version = "";
    var code = dataToCode(data);
    var questionPositions = [];
    for (var i = 1; i <= 30; i++) {
        let pattern = fragments[code][i];
        questionPositions[i] = sellerSearch(pattern, text).start;
    }
    var indices = Array.from(Array(30).keys());
    indices.sort((i, j) => questionPositions[i + 1] - questionPositions[j + 1]);
    data.version = getMainVersion(data);
    var mainAnswers = getAnswers(data);
    var newAnswers = "";
    for (i = 1; i <= 30; i++) {
        newAnswers += mainAnswers[indices[i - 1]];
    }
    return newAnswers;
}

function getCutoff(data) {
    return cutoffs[dataToCode(data)];
}

function getData() {
    return {
        level: getLevel(),
        round: getRound(),
        version: getVersion(),
        year: getYear(),
    };
}

function getLevel() {
    return $("#level").val();
}

function getMainVersion() {
    return "Standaard versie";
}

function getPDFLink() {
    var year = getYear();
    var level = getLevel();
    var round = getRound();
    if (links[year] && links[year][level] && links[year][level][round]) {
        return links[year][level][round];
    }
    return false;
}

function getRound() {
    return $("#round").val();
}

function getSelectionCharacterOffsetWithin(element) {
    var start = 0;
    var end = 0;
    var doc = element.ownerDocument || element.document;
    var win = doc.defaultView || doc.parentWindow;
    var sel;
    if (typeof win.getSelection != "undefined") {
        sel = win.getSelection();
        if (sel.rangeCount > 0) {
            var range = win.getSelection().getRangeAt(0);
            var preCaretRange = range.cloneRange();
            preCaretRange.selectNodeContents(element);
            preCaretRange.setEnd(range.startContainer, range.startOffset);
            start = preCaretRange.toString().length;
            preCaretRange.setEnd(range.endContainer, range.endOffset);
            end = preCaretRange.toString().length;
        }
    } else if ((sel = doc.selection) && sel.type != "Control") {
        var textRange = sel.createRange();
        var preCaretTextRange = doc.body.createTextRange();
        preCaretTextRange.moveToElementText(element);
        preCaretTextRange.setEndPoint("EndToStart", textRange);
        start = preCaretTextRange.text.length;
        preCaretTextRange.setEndPoint("EndToEnd", textRange);
        end = preCaretTextRange.text.length;
    }
    return {
        start: start,
        end: end
    };
}

function getVersion() {
    return $("#version").val();
}

function getYear() {
    return $("#year").val();
}

function hideFeedback(element) {
    element = element || $(".input-field");
    element.removeClass("feedback-correct");
    element.removeClass("feedback-blank");
    element.removeClass("feedback-wrong");
    hideScore();
    $("#changedata").css("display", "none");
}

function hideScore() {
    $(".score").css("display", "none");
}

function isYearPresent(year) {
    for (var i = 0; i < allData.length; i++) {
        if (allData[i].year == year) {
            return true;
        }
    }
    return false;
}

function loadChart() {
    setChartData();
    drawChart();
}

function loadData() {
    var loadPromises = [];
    loadPromises.push(readFile("answers.json").then(result => {
        answers = JSON.parse(result);
        Object.keys(answers).forEach(code => {
            allData.push(codeToData(code));
            answers[code] = answers[code].replace(/ /g, "");
            if (code.length > 8) {
                let shortCode = code.substring(0, 8);
                versions[shortCode] || (versions[shortCode] = []);
                versions[shortCode].push(code.substring(8));
            }
        });
    }));
    loadPromises.push(readFile("cutoffs.json").then(result => {
        cutoffs = JSON.parse(result);
        google.charts.setOnLoadCallback(loadChart);
    }));
    loadPromises.push(readFile("links.json").then(result => {
        links = JSON.parse(result);
    }));
    loadPromises.push(readFile("fragments.json").then(result => {
        fragments = JSON.parse(result);
    }));
    Promise.all(loadPromises).then(setDataToLatest);
}

function parseBooklet(pdf, fragmentsOnly) {
    var maxPages = pdf._pdfInfo.numPages;
    var countPromises = [];
    for (var j = 1; j <= maxPages; j++) {
        var page = pdf.getPage(j);
        countPromises.push(page.then(function(page) {
            var textContent = page.getTextContent();
            return textContent.then(function(text) {
                return text.items.map(function(s) {
                    return s.str;
                }).join("");
            });
        }));
    }
    Promise.all(countPromises).then(function(texts) {
        var text = texts.join("");
        var data = getData();
        var code = dataToCode(data);
        if (fragmentsOnly) {
            getFragmentsAccordingToText(data, text);
        }
        answers[code] = getCurrentMainAnswersAccordingToText(text);
        selectChange();
        $("#booklet-loading").css("display", "none");
    });
}

function setInput(pos, s) {
    var field = getInputField(pos);
    field.html(s);
}

function paste(pos, s) {
    var i = 0;
    for (; i < s.length; i++) {
        let field = getInputField(pos + i);
        if (s[i].match(new RegExp("[" + blank + "]"))) {
            setInput(pos + i, " ");
        } else {
            setInput(pos + i, s[i]);
        }
        hideFeedback(field);
        if (pos + i == 30) {
            setCursor(field[0], 1);
        }
    }
    setFocus(pos + i - 1);
    setFocus(pos + i);
}

function range(start, end, step) {
    var len = ~~((end - start + 1) / step);
    return Array.from({
        length: len
    }, (x, i) => start + step * i);
}

function readFile(file) {
    return new Promise((resolve, reject) => {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", file);
        xhr.onload = () => {
            resolve(xhr.responseText);
        };
        xhr.onerror = reject;
        xhr.send();
    });
}

function restrictDrop(element) {
    element.on("drop", function(e) {
        e.preventDefault();
        var text = "";
        if (e.dataTransfer || e.originalEvent.dataTransfer) {
            text = (e.originalEvent || e).dataTransfer.getData("text/plain");
        } else if (window.dataTransfer) {
            text = window.dataTransfer.getData("Text");
        }
        text = text.replace(new RegExp("[^a-e" + blank.replace(" ", "") + "]", "gi"), "");
        var field = e.currentTarget;
        paste(getPos($(field)), text);
    });
}

function restrictEdit(element) {
    restrictKeypress(element);
    restrictPaste(element);
    restrictDrop(element);
}

function restrictKeypress(element) {
    var ua = navigator.userAgent.toLowerCase();
    var isAndroid = ua.indexOf("android") > -1 && ua.indexOf("mobile") > -1;
    if (!isAndroid) {
        $(element).on("keydown", function(e) {
            var key = e.originalEvent.key;
            if (key.length == 1 && !(e.ctrlKey && key == "v")) {
                e.preventDefault();
                if (new RegExp("^[a-e" + blank + "]$", "i").test(key)) {
                    var pos = getPos($(e.target));
                    var field = getInputField(pos);
                    setInput(pos, key);
                    if (pos < 30) {
                        setFocus(pos + 1);
                    } else {
                        setCursor(field[0], 1);
                    }
                    hideFeedback(field);
                }
            }
        });
    } else {
        $(element).on("keydown", function(e) {
            var field = $(e.target);
            var pos = getPos(field);
            if (parseInt(e.keyCode) != 8) {
                prevInputs[pos] = field.html().replace("&nbsp;", " ").toUpperCase();
                prevCursors[pos] = getSelectionCharacterOffsetWithin(field[0]).end;
                prevKeyDowns[pos] = true;
            }
        });
        $(element).on("keyup", function(e) {
            //e.preventDefault();
            var field = $(e.target);
            var pos = getPos(field);
            var cursor = getSelectionCharacterOffsetWithin(field[0]).end;
            var key = "";
            var newText = field.html().replace("&nbsp;", " ").toUpperCase();
            if (cursor > 0) {
                key = newText.charAt(cursor - 1);
            }
            if (prevKeyDowns[pos] && (newText == prevInputs[pos] + " " || newText == " " + prevInputs[pos])) {
                // space
                emptyInputField(pos);
                hideFeedback(field);
                if (pos < 30) {
                    setFocus(pos + 1);
                } else {
                    setCursor(field[0], 1);
                }
                prevKeyDowns[pos] = false;
                return;
            }
            if (prevKeyDowns[pos] && new RegExp("^[a-e" + blank + "]$", "i").test(key)) {
                setInput(pos, key);
                hideFeedback(field);
                if (pos < 30) {
                    setFocus(pos + 1);
                } else {
                    setCursor(field[0], 1);
                }
                prevKeyDowns[pos] = false;
                return;
            }
            if (prevKeyDowns[pos] && key == "" && prevInputs[pos].length == 1 && newText.length == 0 && prevCursors[pos] == 1 && cursor == 0) {
                // backspace in same field
                hideFeedback(field);
                prevKeyDowns[pos] = false;
                return;
            }
            if (!prevKeyDowns[pos]) return;
            // Key not allowed
            setInput(pos, prevInputs[pos]);
            setCursor(field[0], prevCursors[pos]);
            prevKeyDowns[pos] = false;
        });
    }
}

function restrictPaste(element) {
    element.on("paste", function(e) {
        e.preventDefault();
        var text = "";
        if (e.clipboardData || e.originalEvent.clipboardData) {
            text = (e.originalEvent || e).clipboardData.getData("text/plain");
        } else if (window.clipboardData) {
            text = window.clipboardData.getData("Text");
        }
        text = text.replace(new RegExp("[^a-e" + blank.replace(" ", "") + "]", "gi"), "");
        paste(getPos(element), text);
    });
}

function selectChange(event) {
    // Refresh version select, but not if version was changed.
    if (event && event.delegateTarget.id != "version") {
        refreshVersionSelect();
    }
    hideAllAnswers();
    hideFeedback();
    updateCutoff();
    if (getPDFLink()) {
        $("#openpdf").prop("disabled", false);
    } else {
        $("#openpdf").prop("disabled", true);
    }
    if (getCurrentAnswers()) {
        $(".unavailable").css("display", "none");
        $("#check").prop("disabled", false);
        $("#showall").prop("disabled", false);
        $("#hideall").prop("disabled", false);
        $("#copycheck").prop("disabled", false);
    } else {
        $(".unavailable").css("display", "inline-block");
        $("#check").prop("disabled", true);
        $("#showall").prop("disabled", true);
        $("#hideall").prop("disabled", true);
        $("#copycheck").prop("disabled", true);
    }

    var data = getData();
    data.version = "";
    var code = dataToCode(data);
    data.version = getMainVersion(data);
    var codeMain = dataToCode(data);
    if (getVersion() != getMainVersion(data) && fragments[code] && answers[codeMain]) {
        $("#upload-booklet").css("display", "inline-block");
    } else {
        $("#upload-booklet").css("display", "none");
        $("#booklet-loading").css("display", "none");
        $("#booklet").val("");
    }
}

function selectText(element) {
    var range;
    element.focus();
    if (document.body.createTextRange) {
        range = document.body.createTextRange();
        range.moveToElementText(element);
        range.select();
    } else if (window.getSelection) {
        range = document.createRange();
        range.selectNodeContents(element);
        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }
}

function setChartData() {
    chartData = new google.visualization.DataTable();
    chartData.addColumn("number", "X");
    chartData.addColumn("number", "JWO R1");
    chartData.addColumn("number", "JWO R2");
    chartData.addColumn("number", "VWO R1");
    chartData.addColumn("number", "VWO R2");
    for (var y = startYearV; y <= currentYear; y++) {
        chartData.addRow([y,
            getMeanCutoff({
                year: y,
                level: "JWO",
                round: 1,
            }),
            getMeanCutoff({
                year: y,
                level: "JWO",
                round: 2,
            }),
            getMeanCutoff({
                year: y,
                level: "VWO",
                round: 1,
            }),
            getMeanCutoff({
                year: y,
                level: "VWO",
                round: 2,
            }),
        ]);
    }

    var formatter = new google.visualization.NumberFormat({
        pattern: "0"
    });
    formatter.format(chartData, 0);

}

function setCursor(element, position) {
    setSelection(element, position, position);
}

function setSelection(element, start, end) {
    var range;
    var textNode;
    element.focus();
    if (document.body.createTextRange) {
        textNode = element.childNodes[0];
        range = document.body.createTextRange();
        range.setStart(textNode, start);
        range.setEnd(textNode, end);
        range.select();
    } else if (window.getSelection) {
        textNode = element.childNodes[0];
        range = document.createRange();
        range.setStart(textNode, start);
        range.setEnd(textNode, end);
        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }
}

/**
 * Do an approximate search for pattern in string. Return start and end index of
 * substring (end not included) with smallest edit distance, as well as matched
 * substring and edit distance.
 */
function sellerSearch(pattern, string) {
    var m = pattern.length;
    var n = string.length;
    var distanceMatrix = [];
    for (var i = 0; i <= m; i++) {
        // Distance of part of pattern to empty string
        distanceMatrix[i] = [{
            distance: i,
            start: 0,
        }];
    }
    for (var j = 0; j <= n; j++) {
        // Prepending is free
        distanceMatrix[0][j] = {
            distance: 0,
            start: j,
        };
    }
    for (j = 1; j <= n; j++) {
        for (i = 1; i <= m; i++) {
            let substitutionCost = 1;
            if (pattern[i - 1] == string[j - 1]) {
                substitutionCost = 0;
            }
            let options = [{
                // delete from end of pattern
                prev: {
                    row: i - 1,
                    col: j,
                },
                cost: 1,
            }, {
                // add to end of pattern
                prev: {
                    row: i,
                    col: j - 1,
                },
                cost: 1,
            }, {
                // substitute at end of pattern
                prev: {
                    row: i - 1,
                    col: j - 1,
                },
                cost: substitutionCost,
            }];
            let optionsData = options.map(function(option) {
                var prevData = distanceMatrix[option.prev.row][option.prev.col];
                return {
                    distance: prevData.distance + option.cost,
                    start: prevData.start,
                };
            });
            // Get smallest option
            distanceMatrix[i][j] = argMax(optionsData, (a, b) => b.distance - a.distance).value;
        }
    }
    let endData = argMax(distanceMatrix[m], (a, b) => b.distance - a.distance);
    let start = endData.value.start;
    let end = endData.index;
    return {
        distance: endData.value.distance,
        end: end,
        match: string.substring(start, end),
        start: start,
    };
}

function setData(data) {
    data.year && setYear(data.year);
    data.level && setLevel(data.level);
    data.round && setRound(data.round);
    (data.year || data.level || data.round) && refreshVersionSelect();
    data.version && setVersion(data.version);
    selectChange();
}

function setDataToLatest() {
    makeList();
    let year = currentYear;
    if (!isYearPresent(currentYear)) {
        year -= 1;
    }
    let data = {
        year: year,
        level: "VWO",
        round: 1,
    }
    let mainVersion = getMainVersion(data);
    data.version = mainVersion;
    setData(data);
}

function setLevel(level) {
    $("#level").val(level);
}

function setRound(round) {
    $("#round").val(round);
}

function setVersion(version) {
    $("#version").val(version);
}

function setYear(year) {
    $("#year").val(year);
}

function suggestData(data) {
    var newData = [];
    if (data.year != getYear()) newData.push(yearString(data.year));
    if (data.level != getLevel()) newData.push(data.level);
    if (data.round != getRound()) newData.push("Ronde " + data.round);
    if (data.version && data.version != getVersion()) newData.push(data.version);
    $("#changedata").attr("value", "Bedoelde je: " + newData.join(" ") + "?");
    $("#changedata").click(function() {
        $("#changedata").css("display", "none");
        setData(data);
        checkAnswers();
    });
    $("#changedata").css("display", "inline-block");
}

function updateCutoff() {
    $("#cutoff").html(getCurrentCutoff() || "Onbekend");
}

function optimizeData(inputString) {
    var score = 0;
    var data = {};

    for (var i = 0; i < allData.length; i++) {
        let newScore = scoreWithoutBlanks(inputString, getAnswers(allData[i]));
        if (newScore >= score) {
            score = newScore;
            data = allData[i];
        }
    }
    return {
        data: data,
        score: score,
    };
}

function scoreWithoutBlanks(inputString, answers) {
    var score = 0;
    for (var i = 0; i < answers.length; i++) {
        score += (answers[i] == blankDefault) ? 0 : (inputString[i] == answers[i]) ? 5 : 0;
    }
    return score;
}

function getInputString() {
    var s = "";
    for (var i = 1; i <= 30; i++) {
        s += new String(getInputField(i).html().replace(/&nbsp;|<br>/, "") + " ").substring(0, 1);
    }
    return s.toUpperCase().replace(new RegExp("[" + blank + "]", "g"), blankDefault);
}

function getMeanCutoff(data) {
    if (getAllVersions(data).length <= 1) {
        return getCutoff(data);
    } else {
        let sum = 0;
        let versions = getAllVersions(data);
        versions.forEach(version => {
            let newData = data;
            newData.version = version;
            sum += getCutoff(newData);
        });
        return Math.floor(sum / versions.length);
    }
}

function formatAnswerString(answers, linesep) {
    linesep = linesep || "\n";
    return answers.replace(/(.{10})(?!$)/g, "$1" + linesep).replace(/(^|[^a-z])([A-Z]{5})/gi, "$1$2 ");
}

function copyInputString() {
    copyToClipboard(formatAnswerString(getInputString(), "<br>"));
}

function copyToClipboard(s) {
    if (window.clipboardData) {
        window.clipboardData.setData("Text", s);
    } else {
        $(".input-hidden").html(s);
        selectText($(".input-hidden")[0]);
        document.execCommand("copy");
    }
}

function showHide(element) {
    var currentAnswers = getCurrentAnswers();
    if (currentAnswers) {
        if (parseInt(element.html())) {
            element.html(currentAnswers[getPos(element) - 1]);
        } else {
            element.html(getPos(element));
        }
        element.toggleClass("checkfield-number");
    }
}

function showAllAnswers() {
    var answers = getCurrentAnswers();
    for (var i = 1; i <= 30; i++) {
        getCheckField(i).html(answers[i - 1]);
    }
    $(".check-field").removeClass("checkfield-number");
}

function hideAllAnswers() {
    for (var i = 1; i <= 30; i++) {
        getCheckField(i).html(i);
    }
    $(".check-field").addClass("checkfield-number");
}

function setFocus(pos) {
    if (pos >= 1 && pos <= 30) {
        $("#inputfield" + pos).focus();
    }
}

function getPos(field) {
    return parseInt(field.attr("id").substring(10));
}

function getInputField(pos) {
    return $("#inputfield" + pos);
}

function getCheckField(pos) {
    return $("#checkfield" + pos);
}

function emptyInputField(pos) {
    getInputField(pos).html("");
}

function yearString(y) {
    return (y - 1) + "-" + y;
}

function displayAnswerString(s) {
    return (s == "") ? "TBA" : formatAnswerString(s);
}

function fullString(year) {
    var text = yearString(year) + ":";
    for (var j in [0, 1]) {
        let level = ["JWO", "VWO"][j];
        for (var round = 1; round < 3; round++) {
            let data = {
                year: year,
                level: level,
                round: round,
            };
            let versions = getAllVersions(data);
            if (versions.length == 0) {
                versions = [""];
            }
            for (var i = 0; i < versions.length; i++) {
                data.version = versions[i];
                let answerString = getAnswers(data);
                if (answerString) {
                    text += "\n" + level + " R" + round + "\n";
                    text += displayAnswerString(answerString);
                }
            }
        }
    }
    return text;
}

function makeList() {
    var text = "";
    for (var year = currentYear; year >= startYearV; year--) {
        text += fullString(year) + "\n\n";
    }
    $("#list").html(text);
}

function showHideList() {
    $("#list").toggle();
}

function refreshVersionSelect() {
    var data = getData();
    var versions = getAllVersions(data);
    $("#version").html("");
    if (versions.length > 0) {
        for (var i = 0; i < versions.length; i++) {
            $("#version").append($("<option></option>").attr("value", versions[i]).html(versions[i]));
            $("#version").val(getMainVersion(data));
        }
        $("#version").css("display", "inline-block");
    } else {
        $("#version").val(null);
        $("#version").css("display", "none");
    }
}

function openPDF() {
    var url = getPDFLink();
    url && window.open(url, "_blank");
}
