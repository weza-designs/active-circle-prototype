// Minimal runtime for the Active Circle design-canvas (.dc.html) prototype format.
// Implements: {{expr}} interpolation, <sc-for list as>, <sc-if value>, onClick binding,
// and a DCLogic base class with setState() triggering a re-render. This lets every
// screen authored in this format (existing or new) run as a real, interactive page
// in an ordinary browser, with no other dependency.
(function () {
  "use strict";

  function resolvePath(obj, path) {
    return path.split(".").reduce(function (o, k) {
      return o == null ? undefined : o[k];
    }, obj);
  }

  function wholeExpr(str) {
    if (str == null) return null;
    var m = /^\s*\{\{([\s\S]+)\}\}\s*$/.exec(str);
    return m ? m[1].trim() : null;
  }

  function evalExpr(expr, scopeStack) {
    for (var i = scopeStack.length - 1; i >= 0; i--) {
      var val = resolvePath(scopeStack[i], expr);
      if (val !== undefined) return val;
    }
    return undefined;
  }

  function interpolateString(str, scopeStack) {
    return str.replace(/\{\{([\s\S]+?)\}\}/g, function (_, expr) {
      var v = evalExpr(expr.trim(), scopeStack);
      return v == null ? "" : String(v);
    });
  }

  function DCLogic(props) {
    this.props = props || {};
    if (!this.state) this.state = {};
  }
  DCLogic.prototype.setState = function (patch) {
    this.state = Object.assign({}, this.state, patch);
    if (this._render) this._render();
  };
  window.DCLogic = DCLogic;

  // sc-for/sc-if aware recursive renderer. Operates on a live DOM subtree.
  function render(node, scopeStack) {
    var children = Array.prototype.slice.call(node.childNodes);
    children.forEach(function (child) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.textContent.indexOf("{{") !== -1) {
          child.textContent = interpolateString(child.textContent, scopeStack);
        }
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;

      if (child.tagName === "SC-FOR") {
        var listExpr = wholeExpr(child.getAttribute("list"));
        var list = (listExpr ? evalExpr(listExpr, scopeStack) : []) || [];
        var asName = child.getAttribute("as") || "item";
        var templateChildren = Array.prototype.slice.call(child.childNodes);
        var anchor = child;
        list.forEach(function (item, idx) {
          var frame = {};
          frame[asName] = item;
          frame.index = idx;
          templateChildren.forEach(function (tc) {
            var clone = tc.cloneNode(true);
            anchor.parentNode.insertBefore(clone, anchor);
            if (clone.nodeType === Node.ELEMENT_NODE) {
              render(clone, scopeStack.concat([frame]));
              bindElement(clone, scopeStack.concat([frame]));
            } else if (clone.nodeType === Node.TEXT_NODE && clone.textContent.indexOf("{{") !== -1) {
              clone.textContent = interpolateString(clone.textContent, scopeStack.concat([frame]));
            }
          });
        });
        child.parentNode.removeChild(child);
        return;
      }

      if (child.tagName === "SC-IF") {
        var condExpr = wholeExpr(child.getAttribute("value"));
        var truthy = condExpr ? !!evalExpr(condExpr, scopeStack) : false;
        if (truthy) {
          var tplChildren = Array.prototype.slice.call(child.childNodes);
          tplChildren.forEach(function (tc) {
            var clone = tc.cloneNode(true);
            child.parentNode.insertBefore(clone, child);
            if (clone.nodeType === Node.ELEMENT_NODE) {
              render(clone, scopeStack);
              bindElement(clone, scopeStack);
            } else if (clone.nodeType === Node.TEXT_NODE && clone.textContent.indexOf("{{") !== -1) {
              clone.textContent = interpolateString(clone.textContent, scopeStack);
            }
          });
        }
        child.parentNode.removeChild(child);
        return;
      }

      bindElement(child, scopeStack);
      render(child, scopeStack);
    });
  }

  function bindElement(el, scopeStack) {
    var attrs = Array.prototype.slice.call(el.attributes);
    var eventAttrs = [];

    // Pass 1: interpolate every plain (non on<Event>) attribute first, style
    // included. This has to happen before anything touches el.style (pass 2's
    // cursor hack): the moment JS reads/writes el.style, the browser parses
    // whatever is currently sitting in the style attribute, and if that's
    // still raw template text like "background:{{sigContinueBg}}" it's
    // invalid CSS, so the browser silently drops that declaration for good,
    // before it ever gets a chance to be interpolated into a real color.
    attrs.forEach(function (attr) {
      var name = attr.name.toLowerCase();
      if (name.indexOf("on") === 0 && name.length > 2) {
        eventAttrs.push(attr);
        return;
      }
      if (attr.value.indexOf("{{") !== -1) {
        var w = wholeExpr(attr.value);
        if (w !== null) {
          var v = evalExpr(w, scopeStack);
          el.setAttribute(attr.name, v == null ? "" : String(v));
        } else {
          el.setAttribute(attr.name, interpolateString(attr.value, scopeStack));
        }
      }
    });

    // Pass 2: wire up on<Event>="{{expr}}" bindings (onClick, onInput,
    // onChange, onKeyUp, ...) as real event listeners now that every other
    // attribute, style above all, has already been resolved to real values.
    eventAttrs.forEach(function (attr) {
      var name = attr.name.toLowerCase();
      var whole = wholeExpr(attr.value);
      if (!whole) return;
      var fn = evalExpr(whole, scopeStack);
      var domEvent = name.slice(2);
      el.removeAttribute(attr.name);
      if (typeof fn === "function") {
        if (domEvent === "click") el.style.cursor = el.style.cursor || "pointer";
        el.addEventListener(domEvent, function (e) {
          if (domEvent === "click") e.preventDefault();
          fn(e);
        });
      }
    });
  }

  function mount() {
    var dc = document.querySelector("x-dc");
    var scriptEl = document.querySelector('script[data-dc-script]');
    if (!dc) return;
    if (!scriptEl) return; // fully static page, nothing to do

    var propsAttr = scriptEl.getAttribute("data-props");
    var props = propsAttr ? JSON.parse(propsAttr) : {};
    var code = scriptEl.textContent;
    var ComponentClass;
    try {
      var factory = new Function("DCLogic", code + "\nreturn Component;");
      ComponentClass = factory(DCLogic);
    } catch (e) {
      console.error("support.js: failed to evaluate component script", e);
      return;
    }
    var instance = new ComponentClass(props);
    var pristine = dc.cloneNode(true);
    var current = dc;

    function doRender() {
      var vals = instance.renderVals ? instance.renderVals() : {};
      var fresh = pristine.cloneNode(true);
      render(fresh, [vals]);
      current.parentNode.replaceChild(fresh, current);
      current = fresh;
    }
    instance._render = doRender;
    doRender();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
