module powerbi.extensibility.visual {
    import DataViewObjects = powerbi.extensibility.utils.dataview.DataViewObjects;
    import DataViewObjectPropertyIdentifier = powerbi.DataViewObjectPropertyIdentifier;
    import valueFormatter = powerbi.extensibility.utils.formatting.valueFormatter;
    import tooltip = powerbi.extensibility.utils.tooltip;

    const colorSelector = { objectName: "colorSelector", propertyName: "fill" };
    const enableAxisSelector = { objectName: "enableAxis", propertyName: "show" };
    const enableImagesSelector = { objectName: "enableImages", propertyName: "show" };
    const generalViewOpacitySelector = { objectName: "generalView", propertyName: "opacity" };

    interface ColumnChartViewModel {
        dataPoints: ColumnChartDataPoint[];
        dataMax: number;
        dataMin: number;
        settings: ColumnChartSettings;
    };

    interface ColumnChartDataPoint {
        value: PrimitiveValue;
        category: string;
        color: string;
        imageUrl?: string;
        selectionId: ISelectionId;
    };

    interface ColumnChartSettings {
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

    function visualTransform(options: VisualUpdateOptions, host: IVisualHost): ColumnChartViewModel {
        let dataViews = options.dataViews;
        let defaultSettings: ColumnChartSettings = {
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
        let viewModel: ColumnChartViewModel = {
            dataPoints: [],
            dataMax: 0,
            dataMin: 1,
            settings: <ColumnChartSettings>{}
        };

        if (!dataViews
            || !dataViews[0]
            || !dataViews[0].categorical
            || !dataViews[0].categorical.categories
            || !dataViews[0].categorical.categories[0]) {
            return viewModel;
        }

        const categorical = dataViews[0].categorical;
        const category = categorical.categories[0];
        const hasValues = !!(categorical.values && categorical.values[0]);
        const imageUrlColumns = dataViews[0].metadata.columns.filter(c => c && c.type && c.type.misc && c.type.misc.imageUrl);
        const hasImageUrls = imageUrlColumns.length > 0;

        const columnCount = category.values.length;
        const dataPoints= [];

        let colorPalette: IColorPalette = host.colorPalette;
        let objects = dataViews[0].metadata.objects;
        
        let chartSettings  = {
            enableAxis: {
                show: DataViewObjects.getValue<boolean>(objects, enableAxisSelector, defaultSettings.enableAxis.show),
            },
            enableImages: {
                show: hasImageUrls && DataViewObjects.getValue<boolean>(objects, enableImagesSelector, defaultSettings.enableImages.show)
            },
            generalView: {
                opacity: DataViewObjects.getValue<number>(objects, generalViewOpacitySelector, defaultSettings.generalView.opacity),
            }
        };

        let dataMax: number | undefined = undefined;
        let dataMin: number | undefined = undefined;
        for (let i = 0; i < columnCount; i++) {
            let value: number;
            let url: string | undefined;
            let selectionId: ISelectionId;
            const name = category.values[i] + "";

            if (hasValues) {
                if (hasImageUrls) {
                    const column = categorical.values[i];
                    url = column.source.groupName as string;
                    value = column.values[i] as number;
                } else {
                    const column = categorical.values[0];
                    value = column.values[i] as number;
                    url = undefined;
                }
            }
            else {
                url = undefined;
                value = 0;
            }

            const defaultColor = colorPalette.getColor(name).value;

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

            const color = DataViewObjects.getFillColor(objects, colorSelector, defaultColor);

            dataPoints.push({
                category: name,
                value: value,
                color: color,
                imageUrl: url,
                selectionId: host.createSelectionIdBuilder()
                    .withCategory(category, i)
                    .createSelectionId()
            });
        }

        return {
            dataPoints: dataPoints,
            dataMax: dataMax,
            dataMin: dataMin,
            settings: chartSettings,
        };
    }

    export class ImageColumnChart implements IVisual {
        private svg: d3.Selection<SVGElement>;
        private host: IVisualHost;
        private selectionManager: ISelectionManager;
        private chartContainer: d3.Selection<SVGElement>;
        private columnContainer: d3.Selection<SVGElement>;
        private defs: d3.Selection<SVGElement>;
        private xAxis: d3.Selection<SVGElement>;
        private dataPoints: ColumnChartDataPoint[];
        private chartSettings: ColumnChartSettings;
        private tooltipServiceWrapper: tooltip.ITooltipServiceWrapper;
        private locale: string;
        private formatter: utils.formatting.IValueFormatter;

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

        constructor(options: VisualConstructorOptions) {
            this.formatter = valueFormatter.create({value: 0, precision: 3});
            this.host = options.host;
            this.selectionManager = options.host.createSelectionManager();
            this.tooltipServiceWrapper = tooltip.createTooltipServiceWrapper(this.host.tooltipService, options.element);
            let svg = this.svg = d3.select(options.element)
                .append('svg')
                .classed('columnChart', true);

            this.locale = options.host.locale;

            this.columnContainer = svg.append('g')
                .classed('columnContainer', true);

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
            let viewModel: ColumnChartViewModel = visualTransform(options, this.host);
            let settings = this.chartSettings = viewModel.settings;
            this.dataPoints = viewModel.dataPoints;

            let width = options.viewport.width;
            let height = options.viewport.height;

            this.svg.attr({
                width: width,
                height: height
            });

            if (settings.enableAxis.show) {
                let margins = ImageColumnChart.Config.margins;
                height -= margins.bottom;
            }

            this.xAxis.style({
                'font-size': d3.min([height, width]) * ImageColumnChart.Config.xAxisFontMultiplier,
            });

            let yScale = d3.scale.linear()
                .domain([viewModel.dataMin, viewModel.dataMax])
                .range([height, 0]);

            let xScale = d3.scale.ordinal()
                .domain(viewModel.dataPoints.map(d => d.category))
                .rangeRoundBands([0, width], ImageColumnChart.Config.xScalePadding, 0.2);

            const columnWidth = xScale.rangeBand();
            const imageWidth = columnWidth * 4;
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

            let columns = this.columnContainer.selectAll('.column').data(viewModel.dataPoints);
            columns.enter()
                .append('rect')
                .classed('column', true);

            columns.attr({
                width: xScale.rangeBand(),
                height: d => height - yScale(<number>d.value),
                y: d => yScale(<number>d.value),
                x: d => xScale(d.category)
            });

            if (settings.enableImages.show) {
                columns
                    .attr("fill", d => `url(#bg-${d.category})`)
                    .attr("fill-opacity", viewModel.settings.generalView.opacity / 100);
                    
            }
            else {
                columns
                    .attr("fill", d => d.color)
                    .attr("fill-opacity", viewModel.settings.generalView.opacity / 100);
            }

            this.tooltipServiceWrapper.addTooltip(this.columnContainer.selectAll('.column'),
                (tooltipEvent: tooltip.TooltipEventArgs<number>) => this.getTooltipData(tooltipEvent.data),
                (tooltipEvent: tooltip.TooltipEventArgs<number>) => null);

            let selectionManager = this.selectionManager;
            let allowInteractions = this.host.allowInteractions;

            // This must be an anonymous function instead of a lambda because
            // d3 uses 'this' as the reference to the element that was clicked.
            columns.on('click', function (d) {
                // Allow selection only if the visual is rendered in a view that supports interactivity (e.g. Report)
                if (allowInteractions) {
                    selectionManager.select(d.selectionId).then((ids: ISelectionId[]) => {
                        columns.attr({
                            'fill-opacity': ids.length > 0 ? ImageColumnChart.Config.transparentOpacity : ImageColumnChart.Config.solidOpacity
                        });

                        d3.select(this).attr({
                            'fill-opacity': ImageColumnChart.Config.solidOpacity
                        });
                    });

                    (<Event>d3.event).stopPropagation();
                }
            });

            columns.exit()
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
                            show: this.chartSettings.enableImages.show,
                        },
                        selector: null
                    });
                    break;
                case 'enableAxis':
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            show: this.chartSettings.enableAxis.show,
                        },
                        selector: null
                    });
                    break;
                case 'colorSelector':
                    for (let dataPoint of this.dataPoints) {
                        objectEnumeration.push({
                            objectName: objectName,
                            displayName: dataPoint.category,
                            properties: {
                                fill: {
                                    solid: {
                                        color: dataPoint.color
                                    }
                                }
                            },
                            selector: dataPoint.selectionId
                        });
                    }
                    break;
                case 'generalView':
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            opacity: this.chartSettings.generalView.opacity,
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
            return [{
                displayName: value.category,
                value: this.formatter.format(value.value),
                color: value.color
            }];
        }
    }
}
