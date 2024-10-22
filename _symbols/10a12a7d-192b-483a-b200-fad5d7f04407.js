// Movie night - Updated October 22, 2024
function noop() { }
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}

// Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
// at the end of hydration without touching the remaining nodes.
let is_hydrating = false;
function start_hydrating() {
    is_hydrating = true;
}
function end_hydrating() {
    is_hydrating = false;
}
function upper_bound(low, high, key, value) {
    // Return first index of value larger than input value in the range [low, high)
    while (low < high) {
        const mid = low + ((high - low) >> 1);
        if (key(mid) <= value) {
            low = mid + 1;
        }
        else {
            high = mid;
        }
    }
    return low;
}
function init_hydrate(target) {
    if (target.hydrate_init)
        return;
    target.hydrate_init = true;
    // We know that all children have claim_order values since the unclaimed have been detached if target is not <head>
    let children = target.childNodes;
    // If target is <head>, there may be children without claim_order
    if (target.nodeName === 'HEAD') {
        const myChildren = [];
        for (let i = 0; i < children.length; i++) {
            const node = children[i];
            if (node.claim_order !== undefined) {
                myChildren.push(node);
            }
        }
        children = myChildren;
    }
    /*
    * Reorder claimed children optimally.
    * We can reorder claimed children optimally by finding the longest subsequence of
    * nodes that are already claimed in order and only moving the rest. The longest
    * subsequence of nodes that are claimed in order can be found by
    * computing the longest increasing subsequence of .claim_order values.
    *
    * This algorithm is optimal in generating the least amount of reorder operations
    * possible.
    *
    * Proof:
    * We know that, given a set of reordering operations, the nodes that do not move
    * always form an increasing subsequence, since they do not move among each other
    * meaning that they must be already ordered among each other. Thus, the maximal
    * set of nodes that do not move form a longest increasing subsequence.
    */
    // Compute longest increasing subsequence
    // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
    const m = new Int32Array(children.length + 1);
    // Predecessor indices + 1
    const p = new Int32Array(children.length);
    m[0] = -1;
    let longest = 0;
    for (let i = 0; i < children.length; i++) {
        const current = children[i].claim_order;
        // Find the largest subsequence length such that it ends in a value less than our current value
        // upper_bound returns first greater value, so we subtract one
        // with fast path for when we are on the current longest subsequence
        const seqLen = ((longest > 0 && children[m[longest]].claim_order <= current) ? longest + 1 : upper_bound(1, longest, idx => children[m[idx]].claim_order, current)) - 1;
        p[i] = m[seqLen] + 1;
        const newLen = seqLen + 1;
        // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
        m[newLen] = i;
        longest = Math.max(newLen, longest);
    }
    // The longest increasing subsequence of nodes (initially reversed)
    const lis = [];
    // The rest of the nodes, nodes that will be moved
    const toMove = [];
    let last = children.length - 1;
    for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
        lis.push(children[cur - 1]);
        for (; last >= cur; last--) {
            toMove.push(children[last]);
        }
        last--;
    }
    for (; last >= 0; last--) {
        toMove.push(children[last]);
    }
    lis.reverse();
    // We sort the nodes being moved to guarantee that their insertion order matches the claim order
    toMove.sort((a, b) => a.claim_order - b.claim_order);
    // Finally, we move the nodes
    for (let i = 0, j = 0; i < toMove.length; i++) {
        while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
            j++;
        }
        const anchor = j < lis.length ? lis[j] : null;
        target.insertBefore(toMove[i], anchor);
    }
}
function append_hydration(target, node) {
    if (is_hydrating) {
        init_hydrate(target);
        if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentNode !== target))) {
            target.actual_end_child = target.firstChild;
        }
        // Skip nodes of undefined ordering
        while ((target.actual_end_child !== null) && (target.actual_end_child.claim_order === undefined)) {
            target.actual_end_child = target.actual_end_child.nextSibling;
        }
        if (node !== target.actual_end_child) {
            // We only insert if the ordering of this node should be modified or the parent node is not target
            if (node.claim_order !== undefined || node.parentNode !== target) {
                target.insertBefore(node, target.actual_end_child);
            }
        }
        else {
            target.actual_end_child = node.nextSibling;
        }
    }
    else if (node.parentNode !== target || node.nextSibling !== null) {
        target.appendChild(node);
    }
}
function insert_hydration(target, node, anchor) {
    if (is_hydrating && !anchor) {
        append_hydration(target, node);
    }
    else if (node.parentNode !== target || node.nextSibling != anchor) {
        target.insertBefore(node, anchor || null);
    }
}
function detach(node) {
    if (node.parentNode) {
        node.parentNode.removeChild(node);
    }
}
function destroy_each(iterations, detaching) {
    for (let i = 0; i < iterations.length; i += 1) {
        if (iterations[i])
            iterations[i].d(detaching);
    }
}
function element(name) {
    return document.createElement(name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function prevent_default(fn) {
    return function (event) {
        event.preventDefault();
        // @ts-ignore
        return fn.call(this, event);
    };
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function children(element) {
    return Array.from(element.childNodes);
}
function init_claim_info(nodes) {
    if (nodes.claim_info === undefined) {
        nodes.claim_info = { last_index: 0, total_claimed: 0 };
    }
}
function claim_node(nodes, predicate, processNode, createNode, dontUpdateLastIndex = false) {
    // Try to find nodes in an order such that we lengthen the longest increasing subsequence
    init_claim_info(nodes);
    const resultNode = (() => {
        // We first try to find an element after the previous one
        for (let i = nodes.claim_info.last_index; i < nodes.length; i++) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                return node;
            }
        }
        // Otherwise, we try to find one before
        // We iterate in reverse so that we don't go too far back
        for (let i = nodes.claim_info.last_index - 1; i >= 0; i--) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                else if (replacement === undefined) {
                    // Since we spliced before the last_index, we decrease it
                    nodes.claim_info.last_index--;
                }
                return node;
            }
        }
        // If we can't find any matching node, we create a new one
        return createNode();
    })();
    resultNode.claim_order = nodes.claim_info.total_claimed;
    nodes.claim_info.total_claimed += 1;
    return resultNode;
}
function claim_element_base(nodes, name, attributes, create_element) {
    return claim_node(nodes, (node) => node.nodeName === name, (node) => {
        const remove = [];
        for (let j = 0; j < node.attributes.length; j++) {
            const attribute = node.attributes[j];
            if (!attributes[attribute.name]) {
                remove.push(attribute.name);
            }
        }
        remove.forEach(v => node.removeAttribute(v));
        return undefined;
    }, () => create_element(name));
}
function claim_element(nodes, name, attributes) {
    return claim_element_base(nodes, name, attributes, element);
}
function claim_text(nodes, data) {
    return claim_node(nodes, (node) => node.nodeType === 3, (node) => {
        const dataStr = '' + data;
        if (node.data.startsWith(dataStr)) {
            if (node.data.length !== dataStr.length) {
                return node.splitText(dataStr.length);
            }
        }
        else {
            node.data = dataStr;
        }
    }, () => text(data), true // Text nodes should not update last index since it is likely not worth it to eliminate an increasing subsequence of actual elements
    );
}
function claim_space(nodes) {
    return claim_text(nodes, ' ');
}
function set_data(text, data) {
    data = '' + data;
    if (text.data === data)
        return;
    text.data = data;
}
function set_input_value(input, value) {
    input.value = value == null ? '' : value;
}

let current_component;
function set_current_component(component) {
    current_component = component;
}

const dirty_components = [];
const binding_callbacks = [];
let render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = /* @__PURE__ */ Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
// flush() calls callbacks in this order:
// 1. All beforeUpdate callbacks, in order: parents before children
// 2. All bind:this callbacks, in reverse order: children before parents.
// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
//    for afterUpdates called during the initial onMount, which are called in
//    reverse order: children before parents.
// Since callbacks might update component values, which could trigger another
// call to flush(), the following steps guard against this:
// 1. During beforeUpdate, any updated components will be added to the
//    dirty_components array and will cause a reentrant call to flush(). Because
//    the flush index is kept outside the function, the reentrant call will pick
//    up where the earlier call left off and go through all dirty components. The
//    current_component value is saved and restored so that the reentrant call will
//    not interfere with the "parent" flush() call.
// 2. bind:this callbacks cannot trigger new flush() calls.
// 3. During afterUpdate, any updated components will NOT have their afterUpdate
//    callback called a second time; the seen_callbacks set, outside the flush()
//    function, guarantees this behavior.
const seen_callbacks = new Set();
let flushidx = 0; // Do *not* move this inside the flush() function
function flush() {
    // Do not reenter flush while dirty components are updated, as this can
    // result in an infinite loop. Instead, let the inner flush handle it.
    // Reentrancy is ok afterwards for bindings etc.
    if (flushidx !== 0) {
        return;
    }
    const saved_component = current_component;
    do {
        // first, call beforeUpdate functions
        // and update components
        try {
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
        }
        catch (e) {
            // reset dirty state to not end up in a deadlocked state and then rethrow
            dirty_components.length = 0;
            flushidx = 0;
            throw e;
        }
        set_current_component(null);
        dirty_components.length = 0;
        flushidx = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    seen_callbacks.clear();
    set_current_component(saved_component);
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
/**
 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
 */
function flush_render_callbacks(fns) {
    const filtered = [];
    const targets = [];
    render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
    targets.forEach((c) => c());
    render_callbacks = filtered;
}
const outroing = new Set();
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function mount_component(component, target, anchor, customElement) {
    const { fragment, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    if (!customElement) {
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
            // if the component was destroyed immediately
            // it will update the `$$.on_destroy` reference to `null`.
            // the destructured on_destroy may still reference to the old array
            if (component.$$.on_destroy) {
                component.$$.on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
    }
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        flush_render_callbacks($$.after_update);
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
        fragment: null,
        ctx: [],
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        on_disconnect: [],
        before_update: [],
        after_update: [],
        context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false,
        root: options.target || parent_component.$$.root
    };
    append_styles && append_styles($$.root);
    let ready = false;
    $$.ctx = instance
        ? instance(component, options.props || {}, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if (!$$.skip_bound && $$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            start_hydrating();
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor, options.customElement);
        end_hydrating();
        flush();
    }
    set_current_component(parent_component);
}
/**
 * Base class for Svelte components. Used when dev=false.
 */
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        if (!is_function(callback)) {
            return noop;
        }
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set($$props) {
        if (this.$$set && !is_empty($$props)) {
            this.$$.skip_bound = true;
            this.$$set($$props);
            this.$$.skip_bound = false;
        }
    }
}

/* generated by Svelte v3.59.1 */

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[25] = list[i];
	child_ctx[27] = i;
	return child_ctx;
}

function get_each_context_1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[25] = list[i];
	child_ctx[27] = i;
	return child_ctx;
}

function get_each_context_2(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[25] = list[i];
	child_ctx[27] = i;
	return child_ctx;
}

// (292:2) {#if isAdminPanelVisible}
function create_if_block_3(ctx) {
	let aside;
	let h2;
	let t0;
	let t1;
	let p;
	let t2;

	return {
		c() {
			aside = element("aside");
			h2 = element("h2");
			t0 = text("Admin Panel");
			t1 = space();
			p = element("p");
			t2 = text("Use this panel to edit or delete entries in any list.");
			this.h();
		},
		l(nodes) {
			aside = claim_element(nodes, "ASIDE", { class: true });
			var aside_nodes = children(aside);
			h2 = claim_element(aside_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t0 = claim_text(h2_nodes, "Admin Panel");
			h2_nodes.forEach(detach);
			t1 = claim_space(aside_nodes);
			p = claim_element(aside_nodes, "P", {});
			var p_nodes = children(p);
			t2 = claim_text(p_nodes, "Use this panel to edit or delete entries in any list.");
			p_nodes.forEach(detach);
			aside_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h2, "class", "svelte-9ncqp6");
			attr(aside, "class", "admin-panel svelte-9ncqp6");
		},
		m(target, anchor) {
			insert_hydration(target, aside, anchor);
			append_hydration(aside, h2);
			append_hydration(h2, t0);
			append_hydration(aside, t1);
			append_hydration(aside, p);
			append_hydration(p, t2);
		},
		d(detaching) {
			if (detaching) detach(aside);
		}
	};
}

// (305:8) {#each users as user, index}
function create_each_block_2(ctx) {
	let li;
	let t0_value = /*user*/ ctx[25].name + "";
	let t0;
	let t1;
	let button0;
	let i0;
	let t2;
	let button1;
	let i1;
	let mounted;
	let dispose;

	function click_handler() {
		return /*click_handler*/ ctx[15](/*index*/ ctx[27]);
	}

	function click_handler_1() {
		return /*click_handler_1*/ ctx[16](/*index*/ ctx[27]);
	}

	return {
		c() {
			li = element("li");
			t0 = text(t0_value);
			t1 = space();
			button0 = element("button");
			i0 = element("i");
			t2 = space();
			button1 = element("button");
			i1 = element("i");
			this.h();
		},
		l(nodes) {
			li = claim_element(nodes, "LI", { class: true });
			var li_nodes = children(li);
			t0 = claim_text(li_nodes, t0_value);
			t1 = claim_space(li_nodes);
			button0 = claim_element(li_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			i0 = claim_element(button0_nodes, "I", { class: true });
			children(i0).forEach(detach);
			button0_nodes.forEach(detach);
			t2 = claim_space(li_nodes);
			button1 = claim_element(li_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			i1 = claim_element(button1_nodes, "I", { class: true });
			children(i1).forEach(detach);
			button1_nodes.forEach(detach);
			li_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(i0, "class", "fas fa-times");
			attr(button0, "class", "svelte-9ncqp6");
			attr(i1, "class", "fas fa-edit");
			attr(button1, "class", "svelte-9ncqp6");
			attr(li, "class", "svelte-9ncqp6");
		},
		m(target, anchor) {
			insert_hydration(target, li, anchor);
			append_hydration(li, t0);
			append_hydration(li, t1);
			append_hydration(li, button0);
			append_hydration(button0, i0);
			append_hydration(li, t2);
			append_hydration(li, button1);
			append_hydration(button1, i1);

			if (!mounted) {
				dispose = [
					listen(button0, "click", click_handler),
					listen(button1, "click", click_handler_1)
				];

				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
			if (dirty & /*users*/ 1 && t0_value !== (t0_value = /*user*/ ctx[25].name + "")) set_data(t0, t0_value);
		},
		d(detaching) {
			if (detaching) detach(li);
			mounted = false;
			run_all(dispose);
		}
	};
}

// (312:8) {#if users.length === 0}
function create_if_block_2(ctx) {
	let li;
	let t;

	return {
		c() {
			li = element("li");
			t = text("No users registered");
			this.h();
		},
		l(nodes) {
			li = claim_element(nodes, "LI", { class: true });
			var li_nodes = children(li);
			t = claim_text(li_nodes, "No users registered");
			li_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(li, "class", "empty svelte-9ncqp6");
		},
		m(target, anchor) {
			insert_hydration(target, li, anchor);
			append_hydration(li, t);
		},
		d(detaching) {
			if (detaching) detach(li);
		}
	};
}

// (321:8) {#each waitingList as user, index}
function create_each_block_1(ctx) {
	let li;
	let t0_value = /*user*/ ctx[25].name + "";
	let t0;
	let t1;
	let button0;
	let i0;
	let t2;
	let button1;
	let i1;
	let mounted;
	let dispose;

	function click_handler_2() {
		return /*click_handler_2*/ ctx[17](/*index*/ ctx[27]);
	}

	function click_handler_3() {
		return /*click_handler_3*/ ctx[18](/*index*/ ctx[27]);
	}

	return {
		c() {
			li = element("li");
			t0 = text(t0_value);
			t1 = space();
			button0 = element("button");
			i0 = element("i");
			t2 = space();
			button1 = element("button");
			i1 = element("i");
			this.h();
		},
		l(nodes) {
			li = claim_element(nodes, "LI", { class: true });
			var li_nodes = children(li);
			t0 = claim_text(li_nodes, t0_value);
			t1 = claim_space(li_nodes);
			button0 = claim_element(li_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			i0 = claim_element(button0_nodes, "I", { class: true });
			children(i0).forEach(detach);
			button0_nodes.forEach(detach);
			t2 = claim_space(li_nodes);
			button1 = claim_element(li_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			i1 = claim_element(button1_nodes, "I", { class: true });
			children(i1).forEach(detach);
			button1_nodes.forEach(detach);
			li_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(i0, "class", "fas fa-times");
			attr(button0, "class", "svelte-9ncqp6");
			attr(i1, "class", "fas fa-edit");
			attr(button1, "class", "svelte-9ncqp6");
			attr(li, "class", "svelte-9ncqp6");
		},
		m(target, anchor) {
			insert_hydration(target, li, anchor);
			append_hydration(li, t0);
			append_hydration(li, t1);
			append_hydration(li, button0);
			append_hydration(button0, i0);
			append_hydration(li, t2);
			append_hydration(li, button1);
			append_hydration(button1, i1);

			if (!mounted) {
				dispose = [
					listen(button0, "click", click_handler_2),
					listen(button1, "click", click_handler_3)
				];

				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
			if (dirty & /*waitingList*/ 2 && t0_value !== (t0_value = /*user*/ ctx[25].name + "")) set_data(t0, t0_value);
		},
		d(detaching) {
			if (detaching) detach(li);
			mounted = false;
			run_all(dispose);
		}
	};
}

// (328:8) {#if waitingList.length === 0}
function create_if_block_1(ctx) {
	let li;
	let t;

	return {
		c() {
			li = element("li");
			t = text("No users on waiting list");
			this.h();
		},
		l(nodes) {
			li = claim_element(nodes, "LI", { class: true });
			var li_nodes = children(li);
			t = claim_text(li_nodes, "No users on waiting list");
			li_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(li, "class", "empty svelte-9ncqp6");
		},
		m(target, anchor) {
			insert_hydration(target, li, anchor);
			append_hydration(li, t);
		},
		d(detaching) {
			if (detaching) detach(li);
		}
	};
}

// (337:8) {#each notSureList as user, index}
function create_each_block(ctx) {
	let li;
	let t0_value = /*user*/ ctx[25].name + "";
	let t0;
	let t1;
	let button0;
	let i0;
	let t2;
	let button1;
	let i1;
	let mounted;
	let dispose;

	function click_handler_4() {
		return /*click_handler_4*/ ctx[19](/*index*/ ctx[27]);
	}

	function click_handler_5() {
		return /*click_handler_5*/ ctx[20](/*index*/ ctx[27]);
	}

	return {
		c() {
			li = element("li");
			t0 = text(t0_value);
			t1 = space();
			button0 = element("button");
			i0 = element("i");
			t2 = space();
			button1 = element("button");
			i1 = element("i");
			this.h();
		},
		l(nodes) {
			li = claim_element(nodes, "LI", { class: true });
			var li_nodes = children(li);
			t0 = claim_text(li_nodes, t0_value);
			t1 = claim_space(li_nodes);
			button0 = claim_element(li_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			i0 = claim_element(button0_nodes, "I", { class: true });
			children(i0).forEach(detach);
			button0_nodes.forEach(detach);
			t2 = claim_space(li_nodes);
			button1 = claim_element(li_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			i1 = claim_element(button1_nodes, "I", { class: true });
			children(i1).forEach(detach);
			button1_nodes.forEach(detach);
			li_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(i0, "class", "fas fa-times");
			attr(button0, "class", "svelte-9ncqp6");
			attr(i1, "class", "fas fa-edit");
			attr(button1, "class", "svelte-9ncqp6");
			attr(li, "class", "svelte-9ncqp6");
		},
		m(target, anchor) {
			insert_hydration(target, li, anchor);
			append_hydration(li, t0);
			append_hydration(li, t1);
			append_hydration(li, button0);
			append_hydration(button0, i0);
			append_hydration(li, t2);
			append_hydration(li, button1);
			append_hydration(button1, i1);

			if (!mounted) {
				dispose = [
					listen(button0, "click", click_handler_4),
					listen(button1, "click", click_handler_5)
				];

				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
			if (dirty & /*notSureList*/ 4 && t0_value !== (t0_value = /*user*/ ctx[25].name + "")) set_data(t0, t0_value);
		},
		d(detaching) {
			if (detaching) detach(li);
			mounted = false;
			run_all(dispose);
		}
	};
}

// (344:8) {#if notSureList.length === 0}
function create_if_block(ctx) {
	let li;
	let t;

	return {
		c() {
			li = element("li");
			t = text("No users in not sure list");
			this.h();
		},
		l(nodes) {
			li = claim_element(nodes, "LI", { class: true });
			var li_nodes = children(li);
			t = claim_text(li_nodes, "No users in not sure list");
			li_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(li, "class", "empty svelte-9ncqp6");
		},
		m(target, anchor) {
			insert_hydration(target, li, anchor);
			append_hydration(li, t);
		},
		d(detaching) {
			if (detaching) detach(li);
		}
	};
}

function create_fragment(ctx) {
	let main;
	let h1;
	let t0;
	let t1;
	let form;
	let input0;
	let t2;
	let input1;
	let t3;
	let label;
	let input2;
	let t4;
	let t5;
	let button0;
	let t6;
	let t7;
	let button1;
	let t8;
	let t9;
	let t10;
	let div;
	let section0;
	let h20;
	let i0;
	let t11;
	let t12;
	let ul0;
	let t13;
	let t14;
	let section1;
	let h21;
	let i1;
	let t15;
	let t16;
	let ul1;
	let t17;
	let t18;
	let section2;
	let h22;
	let i2;
	let t19;
	let t20;
	let ul2;
	let t21;
	let mounted;
	let dispose;
	let if_block0 = /*isAdminPanelVisible*/ ctx[6] && create_if_block_3();
	let each_value_2 = /*users*/ ctx[0];
	let each_blocks_2 = [];

	for (let i = 0; i < each_value_2.length; i += 1) {
		each_blocks_2[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
	}

	let if_block1 = /*users*/ ctx[0].length === 0 && create_if_block_2();
	let each_value_1 = /*waitingList*/ ctx[1];
	let each_blocks_1 = [];

	for (let i = 0; i < each_value_1.length; i += 1) {
		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
	}

	let if_block2 = /*waitingList*/ ctx[1].length === 0 && create_if_block_1();
	let each_value = /*notSureList*/ ctx[2];
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	let if_block3 = /*notSureList*/ ctx[2].length === 0 && create_if_block();

	return {
		c() {
			main = element("main");
			h1 = element("h1");
			t0 = text("Event Registration");
			t1 = space();
			form = element("form");
			input0 = element("input");
			t2 = space();
			input1 = element("input");
			t3 = space();
			label = element("label");
			input2 = element("input");
			t4 = text("\n      Not Sure?");
			t5 = space();
			button0 = element("button");
			t6 = text("Register");
			t7 = space();
			button1 = element("button");
			t8 = text("Toggle Admin Panel");
			t9 = space();
			if (if_block0) if_block0.c();
			t10 = space();
			div = element("div");
			section0 = element("section");
			h20 = element("h2");
			i0 = element("i");
			t11 = text(" Registered Users");
			t12 = space();
			ul0 = element("ul");

			for (let i = 0; i < each_blocks_2.length; i += 1) {
				each_blocks_2[i].c();
			}

			t13 = space();
			if (if_block1) if_block1.c();
			t14 = space();
			section1 = element("section");
			h21 = element("h2");
			i1 = element("i");
			t15 = text(" Waiting List");
			t16 = space();
			ul1 = element("ul");

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].c();
			}

			t17 = space();
			if (if_block2) if_block2.c();
			t18 = space();
			section2 = element("section");
			h22 = element("h2");
			i2 = element("i");
			t19 = text(" Not Sure - List");
			t20 = space();
			ul2 = element("ul");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t21 = space();
			if (if_block3) if_block3.c();
			this.h();
		},
		l(nodes) {
			main = claim_element(nodes, "MAIN", { class: true });
			var main_nodes = children(main);
			h1 = claim_element(main_nodes, "H1", { class: true });
			var h1_nodes = children(h1);
			t0 = claim_text(h1_nodes, "Event Registration");
			h1_nodes.forEach(detach);
			t1 = claim_space(main_nodes);
			form = claim_element(main_nodes, "FORM", { class: true });
			var form_nodes = children(form);

			input0 = claim_element(form_nodes, "INPUT", {
				type: true,
				placeholder: true,
				class: true
			});

			t2 = claim_space(form_nodes);

			input1 = claim_element(form_nodes, "INPUT", {
				type: true,
				placeholder: true,
				class: true
			});

			t3 = claim_space(form_nodes);
			label = claim_element(form_nodes, "LABEL", {});
			var label_nodes = children(label);
			input2 = claim_element(label_nodes, "INPUT", { type: true, class: true });
			t4 = claim_text(label_nodes, "\n      Not Sure?");
			label_nodes.forEach(detach);
			t5 = claim_space(form_nodes);
			button0 = claim_element(form_nodes, "BUTTON", { type: true, class: true });
			var button0_nodes = children(button0);
			t6 = claim_text(button0_nodes, "Register");
			button0_nodes.forEach(detach);
			form_nodes.forEach(detach);
			t7 = claim_space(main_nodes);
			button1 = claim_element(main_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			t8 = claim_text(button1_nodes, "Toggle Admin Panel");
			button1_nodes.forEach(detach);
			t9 = claim_space(main_nodes);
			if (if_block0) if_block0.l(main_nodes);
			t10 = claim_space(main_nodes);
			div = claim_element(main_nodes, "DIV", { class: true });
			var div_nodes = children(div);
			section0 = claim_element(div_nodes, "SECTION", { class: true });
			var section0_nodes = children(section0);
			h20 = claim_element(section0_nodes, "H2", { class: true });
			var h20_nodes = children(h20);
			i0 = claim_element(h20_nodes, "I", { class: true });
			children(i0).forEach(detach);
			t11 = claim_text(h20_nodes, " Registered Users");
			h20_nodes.forEach(detach);
			t12 = claim_space(section0_nodes);
			ul0 = claim_element(section0_nodes, "UL", { class: true });
			var ul0_nodes = children(ul0);

			for (let i = 0; i < each_blocks_2.length; i += 1) {
				each_blocks_2[i].l(ul0_nodes);
			}

			t13 = claim_space(ul0_nodes);
			if (if_block1) if_block1.l(ul0_nodes);
			ul0_nodes.forEach(detach);
			section0_nodes.forEach(detach);
			t14 = claim_space(div_nodes);
			section1 = claim_element(div_nodes, "SECTION", { class: true });
			var section1_nodes = children(section1);
			h21 = claim_element(section1_nodes, "H2", { class: true });
			var h21_nodes = children(h21);
			i1 = claim_element(h21_nodes, "I", { class: true });
			children(i1).forEach(detach);
			t15 = claim_text(h21_nodes, " Waiting List");
			h21_nodes.forEach(detach);
			t16 = claim_space(section1_nodes);
			ul1 = claim_element(section1_nodes, "UL", { class: true });
			var ul1_nodes = children(ul1);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].l(ul1_nodes);
			}

			t17 = claim_space(ul1_nodes);
			if (if_block2) if_block2.l(ul1_nodes);
			ul1_nodes.forEach(detach);
			section1_nodes.forEach(detach);
			t18 = claim_space(div_nodes);
			section2 = claim_element(div_nodes, "SECTION", { class: true });
			var section2_nodes = children(section2);
			h22 = claim_element(section2_nodes, "H2", { class: true });
			var h22_nodes = children(h22);
			i2 = claim_element(h22_nodes, "I", { class: true });
			children(i2).forEach(detach);
			t19 = claim_text(h22_nodes, " Not Sure - List");
			h22_nodes.forEach(detach);
			t20 = claim_space(section2_nodes);
			ul2 = claim_element(section2_nodes, "UL", { class: true });
			var ul2_nodes = children(ul2);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(ul2_nodes);
			}

			t21 = claim_space(ul2_nodes);
			if (if_block3) if_block3.l(ul2_nodes);
			ul2_nodes.forEach(detach);
			section2_nodes.forEach(detach);
			div_nodes.forEach(detach);
			main_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h1, "class", "svelte-9ncqp6");
			attr(input0, "type", "text");
			attr(input0, "placeholder", "Enter your name");
			input0.required = true;
			attr(input0, "class", "svelte-9ncqp6");
			attr(input1, "type", "password");
			attr(input1, "placeholder", "Create a password");
			input1.required = true;
			attr(input1, "class", "svelte-9ncqp6");
			attr(input2, "type", "checkbox");
			attr(input2, "class", "svelte-9ncqp6");
			attr(button0, "type", "submit");
			attr(button0, "class", "svelte-9ncqp6");
			attr(form, "class", "svelte-9ncqp6");
			attr(button1, "class", "admin-button svelte-9ncqp6");
			attr(i0, "class", "fas fa-users");
			attr(h20, "class", "svelte-9ncqp6");
			attr(ul0, "class", "svelte-9ncqp6");
			attr(section0, "class", "list-section svelte-9ncqp6");
			attr(i1, "class", "fas fa-hourglass-half");
			attr(h21, "class", "svelte-9ncqp6");
			attr(ul1, "class", "svelte-9ncqp6");
			attr(section1, "class", "list-section svelte-9ncqp6");
			attr(i2, "class", "fas fa-question-circle");
			attr(h22, "class", "svelte-9ncqp6");
			attr(ul2, "class", "svelte-9ncqp6");
			attr(section2, "class", "list-section svelte-9ncqp6");
			attr(div, "class", "columns svelte-9ncqp6");
			attr(main, "class", "svelte-9ncqp6");
		},
		m(target, anchor) {
			insert_hydration(target, main, anchor);
			append_hydration(main, h1);
			append_hydration(h1, t0);
			append_hydration(main, t1);
			append_hydration(main, form);
			append_hydration(form, input0);
			set_input_value(input0, /*userName*/ ctx[3]);
			append_hydration(form, t2);
			append_hydration(form, input1);
			set_input_value(input1, /*userPassword*/ ctx[4]);
			append_hydration(form, t3);
			append_hydration(form, label);
			append_hydration(label, input2);
			input2.checked = /*isNotSure*/ ctx[5];
			append_hydration(label, t4);
			append_hydration(form, t5);
			append_hydration(form, button0);
			append_hydration(button0, t6);
			append_hydration(main, t7);
			append_hydration(main, button1);
			append_hydration(button1, t8);
			append_hydration(main, t9);
			if (if_block0) if_block0.m(main, null);
			append_hydration(main, t10);
			append_hydration(main, div);
			append_hydration(div, section0);
			append_hydration(section0, h20);
			append_hydration(h20, i0);
			append_hydration(h20, t11);
			append_hydration(section0, t12);
			append_hydration(section0, ul0);

			for (let i = 0; i < each_blocks_2.length; i += 1) {
				if (each_blocks_2[i]) {
					each_blocks_2[i].m(ul0, null);
				}
			}

			append_hydration(ul0, t13);
			if (if_block1) if_block1.m(ul0, null);
			append_hydration(div, t14);
			append_hydration(div, section1);
			append_hydration(section1, h21);
			append_hydration(h21, i1);
			append_hydration(h21, t15);
			append_hydration(section1, t16);
			append_hydration(section1, ul1);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				if (each_blocks_1[i]) {
					each_blocks_1[i].m(ul1, null);
				}
			}

			append_hydration(ul1, t17);
			if (if_block2) if_block2.m(ul1, null);
			append_hydration(div, t18);
			append_hydration(div, section2);
			append_hydration(section2, h22);
			append_hydration(h22, i2);
			append_hydration(h22, t19);
			append_hydration(section2, t20);
			append_hydration(section2, ul2);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(ul2, null);
				}
			}

			append_hydration(ul2, t21);
			if (if_block3) if_block3.m(ul2, null);

			if (!mounted) {
				dispose = [
					listen(input0, "input", /*input0_input_handler*/ ctx[12]),
					listen(input1, "input", /*input1_input_handler*/ ctx[13]),
					listen(input2, "change", /*input2_change_handler*/ ctx[14]),
					listen(form, "submit", prevent_default(/*registerUser*/ ctx[7])),
					listen(button1, "click", /*toggleAdminPanel*/ ctx[10])
				];

				mounted = true;
			}
		},
		p(ctx, [dirty]) {
			if (dirty & /*userName*/ 8 && input0.value !== /*userName*/ ctx[3]) {
				set_input_value(input0, /*userName*/ ctx[3]);
			}

			if (dirty & /*userPassword*/ 16 && input1.value !== /*userPassword*/ ctx[4]) {
				set_input_value(input1, /*userPassword*/ ctx[4]);
			}

			if (dirty & /*isNotSure*/ 32) {
				input2.checked = /*isNotSure*/ ctx[5];
			}

			if (/*isAdminPanelVisible*/ ctx[6]) {
				if (if_block0) ; else {
					if_block0 = create_if_block_3();
					if_block0.c();
					if_block0.m(main, t10);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (dirty & /*adminEditUser, deleteUser, users*/ 769) {
				each_value_2 = /*users*/ ctx[0];
				let i;

				for (i = 0; i < each_value_2.length; i += 1) {
					const child_ctx = get_each_context_2(ctx, each_value_2, i);

					if (each_blocks_2[i]) {
						each_blocks_2[i].p(child_ctx, dirty);
					} else {
						each_blocks_2[i] = create_each_block_2(child_ctx);
						each_blocks_2[i].c();
						each_blocks_2[i].m(ul0, t13);
					}
				}

				for (; i < each_blocks_2.length; i += 1) {
					each_blocks_2[i].d(1);
				}

				each_blocks_2.length = each_value_2.length;
			}

			if (/*users*/ ctx[0].length === 0) {
				if (if_block1) ; else {
					if_block1 = create_if_block_2();
					if_block1.c();
					if_block1.m(ul0, null);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}

			if (dirty & /*adminEditUser, deleteUser, waitingList*/ 770) {
				each_value_1 = /*waitingList*/ ctx[1];
				let i;

				for (i = 0; i < each_value_1.length; i += 1) {
					const child_ctx = get_each_context_1(ctx, each_value_1, i);

					if (each_blocks_1[i]) {
						each_blocks_1[i].p(child_ctx, dirty);
					} else {
						each_blocks_1[i] = create_each_block_1(child_ctx);
						each_blocks_1[i].c();
						each_blocks_1[i].m(ul1, t17);
					}
				}

				for (; i < each_blocks_1.length; i += 1) {
					each_blocks_1[i].d(1);
				}

				each_blocks_1.length = each_value_1.length;
			}

			if (/*waitingList*/ ctx[1].length === 0) {
				if (if_block2) ; else {
					if_block2 = create_if_block_1();
					if_block2.c();
					if_block2.m(ul1, null);
				}
			} else if (if_block2) {
				if_block2.d(1);
				if_block2 = null;
			}

			if (dirty & /*adminEditUser, deleteUser, notSureList*/ 772) {
				each_value = /*notSureList*/ ctx[2];
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(ul2, t21);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}

			if (/*notSureList*/ ctx[2].length === 0) {
				if (if_block3) ; else {
					if_block3 = create_if_block();
					if_block3.c();
					if_block3.m(ul2, null);
				}
			} else if (if_block3) {
				if_block3.d(1);
				if_block3 = null;
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(main);
			if (if_block0) if_block0.d();
			destroy_each(each_blocks_2, detaching);
			if (if_block1) if_block1.d();
			destroy_each(each_blocks_1, detaching);
			if (if_block2) if_block2.d();
			destroy_each(each_blocks, detaching);
			if (if_block3) if_block3.d();
			mounted = false;
			run_all(dispose);
		}
	};
}

const maxUsers = 10;
const adminPassword = "admin123"; // Predefined admin password

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;
	let users = [];
	let waitingList = [];
	let notSureList = [];
	let userName = "";
	let userPassword = "";
	let isNotSure = false;
	let isAdminPanelVisible = false; // Toggle for admin panel

	// Load stored data from localStorage
	function loadStoredData() {
		const storedUsers = localStorage.getItem('users');
		const storedWaitingList = localStorage.getItem('waitingList');
		const storedNotSureList = localStorage.getItem('notSureList');
		if (storedUsers) $$invalidate(0, users = JSON.parse(storedUsers));
		if (storedWaitingList) $$invalidate(1, waitingList = JSON.parse(storedWaitingList));
		if (storedNotSureList) $$invalidate(2, notSureList = JSON.parse(storedNotSureList));
	}

	// Save data to localStorage
	function saveDataToLocalStorage() {
		localStorage.setItem('users', JSON.stringify(users));
		localStorage.setItem('waitingList', JSON.stringify(waitingList));
		localStorage.setItem('notSureList', JSON.stringify(notSureList));
	}

	// Check if the username is unique
	function isUsernameUnique(name) {
		return ![...users, ...waitingList, ...notSureList].some(user => user.name === name);
	}

	// Register user or add to "Not Sure - List"
	function registerUser() {
		if (userName.trim() === "" || userPassword.trim() === "") return;

		if (!isUsernameUnique(userName)) {
			alert("Username must be unique. Please choose another name.");
			return;
		}

		if (isNotSure) {
			$$invalidate(2, notSureList = [...notSureList, { name: userName, password: userPassword }]);
		} else {
			if (users.length < maxUsers) {
				$$invalidate(0, users = [...users, { name: userName, password: userPassword }]);
			} else {
				$$invalidate(1, waitingList = [...waitingList, { name: userName, password: userPassword }]);
			}
		}

		saveDataToLocalStorage();
		$$invalidate(3, userName = "");
		$$invalidate(4, userPassword = "");
		$$invalidate(5, isNotSure = false);
	}

	// Delete user after confirming their password
	function deleteUser(index, listType) {
		const enteredPassword = prompt("Enter your password to delete your registration:");
		let list;
		if (listType === 'users') list = users; else if (listType === 'waitingList') list = waitingList; else list = notSureList;

		if (enteredPassword === list[index].password) {
			list.splice(index, 1); // Remove user from list
			if (listType === 'users') $$invalidate(0, users = [...list]); else if (listType === 'waitingList') $$invalidate(1, waitingList = [...list]); else $$invalidate(2, notSureList = [...list]);
			saveDataToLocalStorage();
		} else {
			alert("Incorrect password. Unable to delete entry.");
		}
	}

	// Admin functions
	function adminEditUser(index, listType) {
		const enteredPassword = prompt("Enter admin password to edit this entry:");

		if (enteredPassword === adminPassword) {
			const newName = prompt("Enter the new username:");
			const newPassword = prompt("Enter the new password:");
			let list;
			if (listType === 'users') list = users; else if (listType === 'waitingList') list = waitingList; else list = notSureList;

			if (newName.trim() && newPassword.trim()) {
				list[index].name = newName;
				list[index].password = newPassword;
				if (listType === 'users') $$invalidate(0, users = [...list]); else if (listType === 'waitingList') $$invalidate(1, waitingList = [...list]); else $$invalidate(2, notSureList = [...list]);
				saveDataToLocalStorage();
			} else {
				alert("Both username and password are required.");
			}
		} else {
			alert("Incorrect admin password.");
		}
	}

	// Toggle Admin Panel visibility
	function toggleAdminPanel() {
		const enteredPassword = prompt("Enter admin password to toggle the admin panel:");

		if (enteredPassword === adminPassword) {
			$$invalidate(6, isAdminPanelVisible = !isAdminPanelVisible);
		} else {
			alert("Incorrect admin password.");
		}
	}

	loadStoredData();

	function input0_input_handler() {
		userName = this.value;
		$$invalidate(3, userName);
	}

	function input1_input_handler() {
		userPassword = this.value;
		$$invalidate(4, userPassword);
	}

	function input2_change_handler() {
		isNotSure = this.checked;
		$$invalidate(5, isNotSure);
	}

	const click_handler = index => deleteUser(index, 'users');
	const click_handler_1 = index => adminEditUser(index, 'users');
	const click_handler_2 = index => deleteUser(index, 'waitingList');
	const click_handler_3 = index => adminEditUser(index, 'waitingList');
	const click_handler_4 = index => deleteUser(index, 'notSureList');
	const click_handler_5 = index => adminEditUser(index, 'notSureList');

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(11, props = $$props.props);
	};

	return [
		users,
		waitingList,
		notSureList,
		userName,
		userPassword,
		isNotSure,
		isAdminPanelVisible,
		registerUser,
		deleteUser,
		adminEditUser,
		toggleAdminPanel,
		props,
		input0_input_handler,
		input1_input_handler,
		input2_change_handler,
		click_handler,
		click_handler_1,
		click_handler_2,
		click_handler_3,
		click_handler_4,
		click_handler_5
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, { props: 11 });
	}
}

export { Component as default };
