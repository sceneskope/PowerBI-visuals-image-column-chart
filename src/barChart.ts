module powerbi.extensibility.visual {
    /**
     * Interface for BarCharts viewmodel.
     *
     * @interface
     * @property {BarChartDataPoint[]} dataPoints - Set of data points the visual will render.
     * @property {number} dataMax                 - Maximum data value in the set of data points.
     */
    interface BarChartViewModel {
        dataPoints: BarChartDataPoint[];
        dataMax: number;
        dataMin: number;
        settings: BarChartSettings;
    };

    /**
     * Interface for BarChart data points.
     *
     * @interface
     * @property {number} value             - Data value for point.
     * @property {string} category          - Corresponding category of data value.
     * @property {string} color             - Color corresponding to data point.
     * @property {ISelectionId} selectionId - Id assigned to data point for cross filtering
     *                                        and visual interaction.
     */
    interface BarChartDataPoint {
        value: PrimitiveValue;
        category: string;
        color: string;
        imageUrl?: string;
        selectionId: ISelectionId;
    };

    /**
     * Interface for BarChart settings.
     *
     * @interface
     * @property {{show:boolean}} enableAxis - Object property that allows axis to be enabled.
     */
    interface BarChartSettings {
        enableAxis: {
            show: boolean;
        };

        enableImages: {
            show: boolean;
        }

        generalView: {
            opacity: number;
        };
    }

    /**
     * Function that converts queried data into a view model that will be used by the visual.
     *
     * @function
     * @param {VisualUpdateOptions} options - Contains references to the size of the container
     *                                        and the dataView which contains all the data
     *                                        the visual had queried.
     * @param {IVisualHost} host            - Contains references to the host which contains services
     */
    function visualTransform(options: VisualUpdateOptions, host: IVisualHost): BarChartViewModel {
        let dataViews = options.dataViews;
        let defaultSettings: BarChartSettings = {
            enableAxis: {
                show: false,
            },
            enableImages: {
                show: true
            },
            generalView: {
                opacity: 100
            }
        };
        let viewModel: BarChartViewModel = {
            dataPoints: [],
            dataMax: 0,
            dataMin: 1,
            settings: <BarChartSettings>{}
        };

        if (!dataViews
            || !dataViews[0]
            || !dataViews[0].categorical
            || !dataViews[0].categorical.categories
            || !dataViews[0].categorical.categories[0].source
            || !dataViews[0].categorical.values)
            return viewModel;

        let categorical = dataViews[0].categorical;
        let category = categorical.categories[0];

        const hasNoImageUrls = categorical.values.length === 1;

        let barChartDataPoints: BarChartDataPoint[] = [];

        let colorPalette: IColorPalette = host.colorPalette;
        let objects = dataViews[0].metadata.objects;
        let barChartSettings: BarChartSettings = {
            enableAxis: {
                show: getValue<boolean>(objects, 'enableAxis', 'show', defaultSettings.enableAxis.show),
            },
            enableImages: {
                show: getValue<boolean>(objects, "enableImages", "show", defaultSettings.enableImages.show)
            },
            generalView: {
                opacity: getValue<number>(objects, 'generalView', 'opacity', defaultSettings.generalView.opacity),
            }
        };

        const len = category.values.length;
        let dataMax: number|undefined = undefined;
        let dataMin: number|undefined = undefined;
        for (let i = 0; i < len; i++) {
            let defaultColor: Fill = {
                solid: {
                    color: colorPalette.getColor(category.values[i] + '').value
                }
            };
            let dataValue =  categorical.values[hasNoImageUrls ? 0 : i];
            const imageUrl = hasNoImageUrls ? undefined : dataValue.source.groupName as string;
            const value = dataValue.values[i] as number;
            if (dataMax === undefined) {
                dataMax = value;
            } else if (value > dataMax) {
                dataMax = value;
            }
            if (dataMin === undefined) {
                dataMin = value;
            } else if (value < dataMin) {
                dataMin = value;
            }

            barChartDataPoints.push({
                category: category.values[i] + '',
                value: dataValue.values[i],
                color: getCategoricalObjectValue<Fill>(category, i, 'colorSelector', 'fill', defaultColor).solid.color,
                imageUrl: imageUrl,
                selectionId: host.createSelectionIdBuilder()
                    .withCategory(category, i)
                    .createSelectionId()
            });
        }

        return {
            dataPoints: barChartDataPoints,
            dataMax: dataMax,
            dataMin: dataMin,
            settings: barChartSettings,
        };
    }

    export class ImageBarChart implements IVisual {
        private svg: d3.Selection<SVGElement>;
        private host: IVisualHost;
        private selectionManager: ISelectionManager;
        private barChartContainer: d3.Selection<SVGElement>;
        private barContainer: d3.Selection<SVGElement>;
        private defs: d3.Selection<SVGElement>;
        private xAxis: d3.Selection<SVGElement>;
        private barDataPoints: BarChartDataPoint[];
        private barChartSettings: BarChartSettings;
        private tooltipServiceWrapper: ITooltipServiceWrapper;
        private locale: string;

        static Config = {
            xScalePadding: 0.1,
            solidOpacity: 1,
            transparentOpacity: 0.5,
            margins: {
                top: 0,
                right: 0,
                bottom: 25,
                left: 30,
            },
            xAxisFontMultiplier: 0.04,
        };

        /**
         * Creates instance of BarChart. This method is only called once.
         *
         * @constructor
         * @param {VisualConstructorOptions} options - Contains references to the element that will
         *                                             contain the visual and a reference to the host
         *                                             which contains services.
         */
        constructor(options: VisualConstructorOptions) {
            this.host = options.host;
            this.selectionManager = options.host.createSelectionManager();
            this.tooltipServiceWrapper = createTooltipServiceWrapper(this.host.tooltipService, options.element);
            let svg = this.svg = d3.select(options.element)
                .append('svg')
                .classed('barChart', true);

            this.locale = options.host.locale;

            this.barContainer = svg.append('g')
                .classed('barContainer', true);

            this.xAxis = svg.append('g')
                .classed('xAxis', true);

            this.defs = svg.append("defs");
        }

        /**
         * Updates the state of the visual. Every sequential databinding and resize will call update.
         *
         * @function
         * @param {VisualUpdateOptions} options - Contains references to the size of the container
         *                                        and the dataView which contains all the data
         *                                        the visual had queried.
         */
        public update(options: VisualUpdateOptions) {
            let viewModel: BarChartViewModel = visualTransform(options, this.host);
            let settings = this.barChartSettings = viewModel.settings;
            this.barDataPoints = viewModel.dataPoints;

            let width = options.viewport.width;
            let height = options.viewport.height;

            this.svg.attr({
                width: width,
                height: height
            });

            if (settings.enableAxis.show) {
                let margins = ImageBarChart.Config.margins;
                height -= margins.bottom;
            }

            this.xAxis.style({
                'font-size': d3.min([height, width]) * ImageBarChart.Config.xAxisFontMultiplier,
            });

            let yScale = d3.scale.linear()
                .domain([viewModel.dataMin, viewModel.dataMax])
                .range([height, 0]);

            let xScale = d3.scale.ordinal()
                .domain(viewModel.dataPoints.map(d => d.category))
                .rangeRoundBands([0, width], ImageBarChart.Config.xScalePadding, 0.2);

            const barWidth = xScale.rangeBand();
            const imageWidth = barWidth * 4;
            const imageHeight = (imageWidth / 1024) * 768;

            let xAxis = d3.svg.axis()
                .scale(xScale)
                .orient('bottom');

            this.xAxis.attr('transform', 'translate(0, ' + height + ')')
                .call(xAxis);

            if (settings.enableImages.show) {
                const patterns = this.defs.selectAll("pattern").data(viewModel.dataPoints);
                patterns.enter()
                    .append("pattern")
                    .attr("patternUnits", "userSpaceOnUse")
                    .attr("width", imageWidth)
                    .attr("height", imageHeight)
                    .attr("id", d => `bg-${d.category}`)
                    .append("image")
                    .attr("xlink:href", d => d.imageUrl)
                    .attr("width", imageWidth)
                    .attr("height", imageHeight)

                patterns.exit()
                    .remove();

            }

            let bars = this.barContainer.selectAll('.bar').data(viewModel.dataPoints);
            bars.enter()
                .append('rect')
                .classed('bar', true);

            bars.attr({
                width: xScale.rangeBand(),
                height: d => height - yScale(<number>d.value),
                y: d => yScale(<number>d.value),
                x: d => xScale(d.category)
            });

            if (settings.enableImages.show) {
                bars
                    .attr("fill", d => `url(#bg-${d.category})`);
            }
            else {
                bars
                    .attr("fill", d => d.color)
                    .attr("fill-opacity", viewModel.settings.generalView.opacity / 100);
            }

            this.tooltipServiceWrapper.addTooltip(this.barContainer.selectAll('.bar'),
                (tooltipEvent: TooltipEventArgs<number>) => this.getTooltipData(tooltipEvent.data),
                (tooltipEvent: TooltipEventArgs<number>) => null);

            let selectionManager = this.selectionManager;
            let allowInteractions = this.host.allowInteractions;

            // This must be an anonymous function instead of a lambda because
            // d3 uses 'this' as the reference to the element that was clicked.
            bars.on('click', function (d) {
                // Allow selection only if the visual is rendered in a view that supports interactivity (e.g. Report)
                if (allowInteractions) {
                    selectionManager.select(d.selectionId).then((ids: ISelectionId[]) => {
                        bars.attr({
                            'fill-opacity': ids.length > 0 ? ImageBarChart.Config.transparentOpacity : ImageBarChart.Config.solidOpacity
                        });

                        d3.select(this).attr({
                            'fill-opacity': ImageBarChart.Config.solidOpacity
                        });
                    });

                    (<Event>d3.event).stopPropagation();
                }
            });

            bars.exit()
                .remove();

        }

        /**
         * Enumerates through the objects defined in the capabilities and adds the properties to the format pane
         *
         * @function
         * @param {EnumerateVisualObjectInstancesOptions} options - Map of defined objects
         */
        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {
            let objectName = options.objectName;
            let objectEnumeration: VisualObjectInstance[] = [];

            switch (objectName) {
                case 'enableImages':
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            show: this.barChartSettings.enableImages.show,
                        },
                        selector: null
                    });
                    break;
                case 'enableAxis':
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            show: this.barChartSettings.enableAxis.show,
                        },
                        selector: null
                    });
                    break;
                case 'colorSelector':
                    for (let barDataPoint of this.barDataPoints) {
                        objectEnumeration.push({
                            objectName: objectName,
                            displayName: barDataPoint.category,
                            properties: {
                                fill: {
                                    solid: {
                                        color: barDataPoint.color
                                    }
                                }
                            },
                            selector: barDataPoint.selectionId
                        });
                    }
                    break;
                case 'generalView':
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            opacity: this.barChartSettings.generalView.opacity,
                        },
                        validValues: {
                            opacity: {
                                numberRange: {
                                    min: 10,
                                    max: 100
                                }
                            }
                        },
                        selector: null
                    });
                    break;
            };

            return objectEnumeration;
        }

        /**
         * Destroy runs when the visual is removed. Any cleanup that the visual needs to
         * do should be done here.
         *
         * @function
         */
        public destroy(): void {
            // Perform any cleanup tasks here
        }

        private getTooltipData(value: any): VisualTooltipDataItem[] {
            let language = getLocalizedString(this.locale, "LanguageKey");
            return [{
                displayName: value.category,
                value: value.value.toString(),
                color: value.color,
                header: language && "displayed language " + language
            }];
        }
    }
}
