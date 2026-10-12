import { $, $all, h, on, r, toJson, toText } from '../utilities/shorthands.js';

export function createUiAdapter() {
	return {
		$,
		$all,
		on,
		h,
		r,
		toJson,
		toText,
		setFilename(text) {
			$('#filename').textContent = text;
		},
		bindTabs() {
			const tablinks = $all('.tablink');
			on('click', tablinks, (event) => {
				tablinks.forEach((t) => t.classList.remove('active'));
				event.target.classList.add('active');
				const selectedTab = event.target.getAttribute('data-tab');
				$all('.sidebar-tab').forEach((t) => {
					t.style.display = 'none';
				});
				$(`[id="${selectedTab}"]`).style.display = 'block';
			});
		},
			renderRelationshipToggles(elementId, edgeLabels, handlers) {
			r(elementId, [
				h('thead', {}, [
					h('tr', {}, [
						h('th', {}, ['Edge Type']),
						h('th', {}, ['└']),
						h('th', {}, ['╰']),
						h('th', {}, ['Action']),
					]),
				]),
				...edgeLabels.map((edgeLabel) => h('tr', {}, [
					h('td', {}, [
						h('label', { for: edgeLabel }, [
							h('input', {
								type: 'checkbox',
								id: edgeLabel,
								name: 'showrels',
								value: edgeLabel,
								class: 'edgeLabels',
							}, [], {
								change: (event) => handlers.onToggleEdge(event.target),
							}, (e) => {
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
							change: (event) => handlers.onLineBend(event.target),
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
							change: (event) => handlers.onLineBend(event.target),
						}, (e) => {
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
							click: (event) => handlers.onLift(event.target.value),
						}),
						' ',
						h('button', {
							class: 'sidebar',
							id: `${edgeLabel}-lower`,
							value: edgeLabel,
							title: 'Lower edges',
						}, ['⬇'], {
							click: (event) => handlers.onLower(event.target.value),
						}),
					]),
				])),
				]);
			},
			renderColoringModes(modes) {
				r('#coloring-options', modes.map((mode, idx) => h('div', {}, [
					h('label', { for: `coloring-${mode.id}`, class: 'coloringlabel' }, [
						h('input', {
							type: 'radio',
							id: `coloring-${mode.id}`,
							name: 'coloring',
							value: mode.scratchKey || mode.id,
							class: 'coloring-input',
						}, [], {}, (input) => {
							input.checked = idx === 0;
						}),
						mode.label,
					]),
				])));
			},
            listCyclicDependencies(cycles, handler) {
                r('#menu-cycles', [
                        h('h2', {}, ['Cyclic Dependencies']),
                        h('ul', {}, cycles.map((cycle, idx) => 
                            h('li', {class: 'selectable-list-item'}, [
                                h('h3', {}, `Cycle ${idx + 1}`),
                                h('p', {}, `${cycle.join(' -> ')}`),
                                h('button', {}, 'Inspect', {
                                    click: (event) => {
                                        const item = event.currentTarget.closest('li');
                                        item.parentElement.querySelectorAll('#menu-cycles .selectable-list-item.active').forEach((el) => el.classList.remove('active'));
                                        item.classList.add('active')
                                        handler(idx)
                                    }
                                })
                            ])
                        )),
                    ]);
            },
            listScopes(scopes, defaultSelected, exit, selectScope) {
                r("#menu-scope", [
                    h('h2', {}, ['Scopes']),
                    h('p', {}, 'Cyclic dependency edge scope'),
                    h('button', {}, 'Exit CD inspection mode', {
                        click: (event) => {
                            document.querySelectorAll('#menu-cycles .selectable-list-item.active').forEach((el) => el.classList.remove('active'));
                            exit()
                        }
                    }),
                    h('div', {class: 'edge-scopes'}, scopes.map((scope) => 
                        h('label', {}, [
							h('input', {
								type: 'checkbox',
								id: `scope-${scope}`,
								name: 'scope',
								value: scope,
								class: 'scope-input',
							}, [], {
								change: (event) => selectScope(event.target),
							}, (e) => {
								e.checked = defaultSelected.has(scope);
							}),
							scope,
						]),
                    ))
                ])
            },
            removeScopes() {
                r("#menu-scope", [])
            },
            listRefactorings(refactorings, handler) {
                r('#menu-refactor', [
                    h('h2', {}, ['Refactoring Opportunities']),
                    h('ul', {}, refactorings.map((refactoring, idx) => 
                        h('li', {class: 'selectable-list-item'}, [
                            h('h3', {}, `Option ${idx + 1}`),
                            h('p', {}, `${refactoring.name} for ${refactoring.targetClass}`),
                            h('button', {}, 'preview', {
							click: (event) => {
                                const item = event.currentTarget.closest('li');
                                item.parentElement.querySelectorAll('#menu-refactor .selectable-list-item.active').forEach((el) => el.classList.remove('active'));
                                item.classList.add('active')
                                handler(refactoring)
                            },
						})
                        ])
                    )),
                ]);
            }
        };
	}
