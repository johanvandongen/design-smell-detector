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
        let borderColor = "grey"//style['border-color'];
        let backgroundColor = style['background-color']
        if (nodeHasLabel(n, "CD-smell")) {
            borderColor = "red";
        }
        if (nodeHasLabel(n, "New")) {
            backgroundColor = "#e8f5e9";
        }
        if (nodeHasLabel(n, "Modified")) {
            backgroundColor = "#fff3e0"
        }
        if (nodeHasLabel(n, "Removed")) {
            backgroundColor = "#ffebee"
        }
		addScratch(n, 'style_default', {
			'color': style['color'],
			'border-color': borderColor,
			'background-color': backgroundColor,
			'background-fill': style['background-fill']
		});
	});
}

const decreaseLiftScratch = (pCy, label) => {
    const scratchData = pCy.scratch('_lift')
    if (scratchData && Object.hasOwn(scratchData, label)) {
        if (scratchData[label] === 0) {
            return;
        }
        scratchData[label] = scratchData[label] - 1
        pCy.scratch('_lift', {...scratchData})
    }
}
const increaseLiftScratch = (pCy, label) => {
    const scratchData = pCy.scratch('_lift')
    if (!scratchData) {
        const d = {};
        d[label] = 1;
        pCy.scratch('_lift', d)
    } else if (scratchData && Object.hasOwn(scratchData, label)) {
        scratchData[label] = scratchData[label] + 1
        pCy.scratch('_lift', {...scratchData})
    } else {
        scratchData[label] = 1;
        pCy.scratch('_lift', {...scratchData})
    }
}

export const liftEdges = function (pCy, label) {
    increaseLiftScratch(pCy, label)
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
    decreaseLiftScratch(pCy, label)
	const maxLevel = Math.max(...pCy.edges(`[label="${label}"]`)
		.map((e) => e.data('properties.level'))
		.filter((l) => Number.isFinite(l)));
	pCy.edges(`[label="${label}"]`)
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

export const applyRefactoringChangeSet = (graphToUpdate, changeSet, stateOriginal) => {
        const cynew = graphToUpdate

        changeSet.addedNodes.forEach((n) => {
            const node = cynew.add({
                group: 'nodes',
                data: n,
            })
            node.addClass(n.labels)
        })
        changeSet.addedNodes.forEach((n) => {
            if (n.parent) {
                cynew.getElementById(n.id).move({parent: n.parent});
            }
        })

        const copyNodeFromHcy = (node) => {
            const nodeFromHcy = stateOriginal.hcy.getElementById(node);
            if (nodeFromHcy.empty()) {
                console.log("Could not add edge with node ", node)
                return;
            }
            const nodeData = nodeFromHcy.data();
            const newNode = cynew.add({
                group: 'nodes',
                data: {...nodeData, labels: [...nodeData.labels, "Modified"]}
            });
            newNode.addClass(nodeData.labels)
        }
        
        changeSet.addedEdges.forEach((n) => {
            if (cynew.getElementById(n.source).empty()) {copyNodeFromHcy(n.source)}
            if (cynew.getElementById(n.target).empty()) {copyNodeFromHcy(n.target)}
            
            const edgeExists = cynew.getElementById(n.id).nonempty()
            if (edgeExists) { return }
            if (cynew.edges().filter((e) => e.source().id() === n.source && e.target().id() === n.target && e.data("interaction") === n.interaction).length > 0) {
                console.log("Did not allow duplicate edge: ", n);
                return;
            }

            cynew.add({
                group: 'edges',
                data: n,
            })
        })

        changeSet.updatedNodes.forEach((n) => {
            let node = cynew.getElementById(n.id)
            if (node.empty()) { return; }
            const labels = node.data("labels");
            if (labels && !labels.includes(n.newLabel)) {
                node.data("labels", [...labels, n.newLabel]);
            }
        })

        changeSet.removeEdgeIds.forEach((e) => {
            cynew.getElementById(e).remove();
        })
        changeSet.removeEdges.forEach((e) => {
            cynew.getElementById(e.id).remove();
        })
        changeSet.removeNodeIds.forEach((e) => {
            cynew.getElementById(e).remove();
        })
        
        cynew.$().forEach((ele) => {
            if (ele.data("labels")) {
                ele.data("labels").forEach((label) => {
                    if (!ele.classes().includes(label) && label === "Type" || label === "New" || label === "Modified") {
                        ele.addClass(label)
                    }
                })
            }
        })
        
        cynew.$('.New').forEach((ele) => {
            ele.addClass("Expanded")
        })
        cynew.$('.Modified').forEach((ele) => {
            ele.addClass("Expanded")
        })
        
        // cynew.nodes().filter((n) => nodeHasLabel(n, "Operation")).remove()
        // cynew.nodes().filter((n) => nodeHasLabel(n, "Variable")).remove()

        // state.hiddenNodes = cynew.nodes().filter((n) => nodeHasLabel(n, "Variable"))

        // state.hiddenNodes['variables'][clasz.id()] = clasz.children().filter((n) => nodeHasLabel(n, "Variable"))
        // cynew.nodes().filter((n) => nodeHasLabel(n, "Operation")).forEach((n) =>
        // {
        //     if (n.id() == "nl.tudelft.jpacman.npc.ghost.Inky.followPath(java.util.List,nl.tudelft.jpacman.board.Square)") {
        //         n.connectedEdges().remove()
        //         n.remove()
        //         console.warn(`Could not remove node`, n.data())
        //         return;
        //     }
        //     state.hiddenNodes.append(n)
        //     n.remove()
        // })
        // state.hiddenNodes.remove()
    }

