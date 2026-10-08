import { hslString, roleStereotypeColors, whiten } from "../utilities/colors.js";
import { $all } from "../utilities/shorthands.js";
import { addScratch, counterToPercentage, cumulative, nodeHasLabel, nodeHasKind, isPureContainer, repeatMiddle, edgeHasLabel } from "../utilities/utils.js";

export const recolorContainers = function (pCy) {
	const max_pkg_depth = Math.max(...pCy.nodes(isPureContainer).map((n) => n.ancestors().length));

	// Isolate containers
	pCy.nodes(isPureContainer).forEach((n) => {
		const dark = 0.75;
		const light = 0.9;
		const depth = n.ancestors().length;
		const l = light - (light-dark)*(max_pkg_depth-depth)/max_pkg_depth;
		n.style('background-color', hslString({h:0,s:0,l}));
		n.style('text-background-color', hslString({ h: 0, s: 0, l }));
	});
}

export const cacheNodeStyles = function (pCy) {
	pCy.nodes().forEach((n) => {
		const style = n.style();
        let borderColor = style['border-color'];
        if (nodeHasLabel(n, "CD-smell")) {
            borderColor = "red";
        }
        if (nodeHasLabel(n, "New")) {
            borderColor = "green";
        }
        if (nodeHasLabel(n, "Modified")) {
            borderColor = "orange"
        }
        if (nodeHasLabel(n, "Removed")) {
            borderColor = "red"
        }
		addScratch(n, 'style_default', {
			'color': style['color'],
			'border-color': borderColor,
			'background-color': style['background-color'],
			'background-fill': style['background-fill']
		});
	});
}

export const liftEdges = function (pCy, label) {
	const edges = pCy
		.edges((e) => edgeHasLabel(e, label))
		.filter((e) => {
			const srcId = e.source().parent().id() ? e.source().parent().id() : e.source().id();
			const tgtId = e.target().parent().id() ? e.target().parent().id() : e.target().id();
			return srcId !== tgtId;
		});
	const newEdges = {};

	edges.forEach((e) => {
		const srcId = e.source().parent().id() ? e.source().parent().id() : e.source().id();
		const tgtId = e.target().parent().id() ? e.target().parent().id() : e.target().id();
		if (!('level' in e.data('properties'))) {
			e.data('properties')['level'] = 0;
		}
		const key = `${srcId}-${e.data('label')}-${tgtId}`;
		if (!newEdges[key]) {
			newEdges[key] = {
				group: "edges", data: {
					source: srcId,
					target: tgtId,
					label: e.data('label'),
					interaction: e.data('label'),
					properties: {
						...e.data('properties'),
						level: e.data('properties.level')+1,
						weight: 0,
						bundle: [],
						metaSrc: "lifting"
					}
				}
			};
		}
		newEdges[key].data.properties["weight"] += e.data('properties.weight');
		newEdges[key].data.properties["bundle"].push(e);
	});
	pCy.add(Object.values(newEdges));
	edges.remove();

	adjustEdgeWidths(pCy);
}

export const lowerEdges = function (pCy, label) {
	const maxLevel = Math.max(...cy.edges(`[label="${label}"]`)
		.map((e) => e.data('properties.level'))
		.filter((l) => Number.isFinite(l)));
	cy.edges(`[label="${label}"]`)
		.filter((e) => e.data('properties.level') === maxLevel)
		.forEach((edge) => {
			// console.log(edge.data('properties')['bundle'])
			if ('bundle' in edge.data('properties')) {
				try {
					edge.data('properties.bundle').forEach((bundledEdge) => {
						bundledEdge.restore();
					});
					edge.remove();
				} finally {
					;
				}
			}
		});
	adjustEdgeWidths(pCy);
};

export const removeContainmentEdges = function (pCy) {
	pCy.edges('[label="encloses"]').remove();
}

export const adjustEdgeWidths = function (pCy) {
	pCy.edges().forEach((e) => {
		e.style('width', `${Math.pow(e.data('properties.weight'), 0.7) * 2}px`)
	});
}

// Deprecated cacheNodeStyles no colors smell labels
export const setSmellStyles = function (pCy) {
    //  pCy.nodes(n => nodeHasLabel(n, 'CD-smell')).forEach((n) => {
    //     addScratch(n, 'style_default', {
    //         'border-color': 'red',
    //     })
    // })
}

export const removeExtraNodes = function (pCy) {
	const extras = pCy.nodes(n => 
		!nodeHasLabel(n, "Scope") && 
		!nodeHasLabel(n, "Type") && 
        !nodeHasLabel(n, "Operation") &&
        !nodeHasKind(n, "field") &&
		!nodeHasLabel(n, "Primitive"));
	extras.remove();
};

export const showNeighborhood = function (nodes) {

	const to_check = nodes.children().union(nodes);
	to_check.union(nodes.ancestors()).removeClass("dimmed");

	// currently visible relationship types
	const edge_labels = $all('input[name="showrels"]')
		.filter(cb => cb.checked)
		.map(cb => cb.value);

	const edges = to_check.connectedEdges((e) => edge_labels.includes(e.data("label")));
	edges
		.union(edges.targets())
		.union(edges.targets().ancestors())
		.union(edges.sources())
		.union(edges.sources().ancestors())
		.removeClass("dimmed");
};

