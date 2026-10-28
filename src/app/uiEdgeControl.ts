// @ts-ignore
import { $, $all, h, on, r, toJson, toText } from '../utilities/shorthands.js';
// @ts-ignore
import { clone, identity, lens, not, over, pipe, tap } from '../composing.js';
// @ts-ignore
import { deriveRelationshipLabels } from './pure.js';
// @ts-ignore
import { liftEdges, lowerEdges } from '../graphProcessing/visualTransformations.js';

const hiddenEdgesLens = lens(
	(state: any) => state.hiddenEdges,
	(value: any, state: any) => ({
		...state,
		hiddenEdges: value,
	})
);


export class UIEdgeControls {
    private state: any;

    constructor(state: any) {
        this.state = state
    }
    mutateState = (transform: any) => Object.assign(this.state, transform(this.state));

    setEdgeVisibilityViaCheckbox(checkbox: HTMLInputElement) {
        this.setEdgeVisibility(checkbox.value, checkbox.checked)
    }

    /** Checkboxes required so ui elements are in sync with rendered graph */
    setEdgeVisibilityViaRelation(relation: string, visibility: boolean, checkboxes: HTMLInputElement[]) {
        this.setEdgeVisibility(relation, visibility);
        checkboxes.forEach((checkbox) => {
            if (checkbox.value === relation) {
                checkbox.checked = visibility;
            }
        });
    }
    
    /** visibiliy: true if you want visible, false otherwise */
    setEdgeVisibility(relation: string, visibility: boolean) {
        // TODO investigate why remove and restore is ussed instead of using display hidden
        // Right now hiddenEdges, is not hidden, but just a lookup table for all edges. Maybe
        // restore/remove was used to free up space?
        if (this.state.inspect || true) {
            const updateHiddenEdges = (hiddenEdges: any) => {
                const next = clone(hiddenEdges || {});
                if (!visibility) {
                    next[relation] = this.state.cy.edges(`[label = "${relation}"]`).union(next[relation]); // Ugly way (quick fix) to have next[checkbox.value] be always have all the original edges, better to set it once and then never change it
                    next[relation].remove();
                    return next;
                }
                if (next[relation]) {
                    if (this.state.inspect) {
                        // Only restore edges that fit the current scope.s
                        const scopes = this.state.inspect.scopes;
                        const sccNodeIds = this.state.inspect.nodes;
                        const outsideEdges = (edge: any) => !sccNodeIds.includes(edge.source().id()) && !sccNodeIds.includes(edge.target().id());
                        const insideEdges = (edge: any) => sccNodeIds.includes(edge.source().id()) && sccNodeIds.includes(edge.target().id());
                        const boundaryEdges = (edge: any) => sccNodeIds.includes(edge.source().id()) != sccNodeIds.includes(edge.target().id());
                        const edgeScope = (edge: any) => (scopes.has("Outside") && outsideEdges(edge)) || (scopes.has("Inside") && insideEdges(edge)) || (scopes.has("Boundary") && boundaryEdges(edge))
                        const edgesToRestore = next[relation].edges().filter((edge: any) => edge.source().id() !== undefined && edge.target().id !== undefined  && edge.data("label") === relation && edgeScope(edge))
                        edgesToRestore.restore();
                    } else {
                        next[relation].restore();
                        next[relation] = null;
                    }
                }
                return next;
            };
            this.mutateState((s: any) => over(hiddenEdgesLens, updateHiddenEdges, s));
            return;
        }
    }

	setLineBends({ checked, name, value }: {checked: boolean, name: string, value: string}) {
		if (!this.state.cy || !checked) return;
		this.state.cy.edges(`[label = "${name}"]`).style('curve-style', value);
	}

    render() {
        const edgeLabels = deriveRelationshipLabels(this.state.cy.json().elements)
        console.log(edgeLabels)
			return h('div', {}, [
				h('thead', {}, [
					h('tr', {}, [
						h('th', {}, ['Edge Type']),
						h('th', {}, ['└']),
						h('th', {}, ['╰']),
						h('th', {}, ['Action']),
					]),
				]),
				...edgeLabels.map((edgeLabel: any) => h('tr', {}, [
					h('td', {}, [
						h('label', { for: edgeLabel }, [
							h('input', {
								type: 'checkbox',
								id: edgeLabel,
								name: 'showrels',
								value: edgeLabel,
								class: 'edgeLabels',
							}, [], {
								change: (event: any) => this.setEdgeVisibilityViaCheckbox(event.target),
							}, (e: any) => {
								e.checked = ['calls'].includes(edgeLabel);
							}),
							edgeLabel,
						]),
					]),
					h('td', {}, [
						h('input', {
							type: 'radio',
							id: `${edgeLabel}-ort`,
							name: edgeLabel,
							value: 'taxi',
							title: 'Orthogonal',
						}, [], {
							change: (event: any) => this.setLineBends(event.target),
						}),
					]),
					h('td', {}, [
						h('input', {
							type: 'radio',
							id: `${edgeLabel}-bez`,
							name: edgeLabel,
							value: 'bezier',
							title: 'Bezier',
						}, [], {
							change: (event: any) => this.setLineBends(event.target),
						}, (e: any) => {
							e.checked = true;
						}),
					]),
					h('td', {}, [
						h('button', {
							class: 'sidebar',
							id: `${edgeLabel}-lift`,
							value: edgeLabel,
							title: 'Lift edges',
						}, ['⬆'], {
							click: (event: any) => liftEdges(this.state.cy, event.target.value),
						}),
						' ',
						h('button', {
							class: 'sidebar',
							id: `${edgeLabel}-lower`,
							value: edgeLabel,
							title: 'Lower edges',
						}, ['⬇'], {
							click: (event: any) => liftEdges(this.state.cy, event.target.value),
						}),
					]),
				])),
				]);
			}
}