
module powerbi.extensibility.visual {
    import DataRoleHelper = powerbi.extensibility.utils.dataview.DataRoleHelper;
    import TooltipEnabledDataPoint = powerbi.extensibility.utils.tooltip.TooltipEnabledDataPoint;
    import interactivity = powerbi.extensibility.utils.interactivity;
    import formatting = powerbi.extensibility.utils.formatting;

    export interface Model {
        dataPoints: DataPoint[];
        minY: number;
        maxY: number;
        settings: Settings;
        categoryMetadata: DataViewMetadataColumn;
        valueMetadata: DataViewMetadataColumn;
        valueLabelFormatter: formatting.IValueFormatter;
        categoryLabelFormatter: formatting.IValueFormatter;
    }

    export interface DataPoint extends TooltipEnabledDataPoint, interactivity.SelectableDataPoint {
        value: PrimitiveValue;
        category: string;
        color: string;
        imageUrl?: string;
    }

    function tryGetMetadataColumn(dataview: DataView, role: string) {
        if (dataview.metadata && dataview.metadata.columns) {
            for (const column of dataview.metadata.columns) {
                if (DataRoleHelper.hasRole(column, role)) {
                    return column;
                }
            }
        }

        return undefined;
    }

    interface MeasureInformation {
        index: number;
        values: DataViewValueColumn;
        source: DataViewMetadataColumn;
        formatter: formatting.IValueFormatter;
    }

    function getMeasureIndexIfSet(dataView: DataView,
        grouped: powerbi.DataViewValueColumnGroup[], role: string): MeasureInformation | undefined {
        const hasRole = DataRoleHelper.hasRoleInDataView(dataView, role);
        if (hasRole) {
            const measureIndex = DataRoleHelper.getMeasureIndexOfRole(grouped, role);
            const category = dataView.categorical!.values![measureIndex];
            const formatter = formatting.valueFormatter.create({
                format: formatting.valueFormatter.getFormatStringByColumn(category.source)
            });

            return {
                index: measureIndex,
                values: category,
                source: category.source,
                formatter
            };
        }

        return undefined;
    }

    export function visualTransform(dataView: DataView | undefined, host: IVisualHost): Model | undefined {
        if (!dataView
            || !dataView.categorical
            || !dataView.categorical.categories
            || !dataView.categorical.categories.length) {
            return undefined;
        }
        const categoryMetadata = tryGetMetadataColumn(dataView, "Series")!;
        const settings = Settings.parse<Settings>(dataView);
        const categorical = dataView.categorical;
        const values = categorical.values;
        const grouped = values!.grouped();
        const category = categorical.categories![0];

        const yIndex = getMeasureIndexIfSet(dataView, grouped, "Y");
        const imageIndex = getMeasureIndexIfSet(dataView, grouped, "Image");

        let minValue = Number.MAX_VALUE;
        let maxValue = -Number.MAX_VALUE;
        const tryGetValue = (index: number, measureInformation: MeasureInformation | undefined)
            : PrimitiveValue | undefined => {
            if (measureInformation !== undefined) {
                const value = measureInformation.values.values[index];
                if (!isNaN(value as any)) {
                    const numberValue = value as number;
                    if (numberValue < minValue) {
                        minValue = numberValue;
                    }
                    if (numberValue > maxValue) {
                        maxValue = numberValue;
                    }
                }
                return value;
            }
        };

        const dataPoints: DataPoint[] = category.values.map((value, index) => {
            const tooltip: VisualTooltipDataItem = {
                displayName: category.source.displayName, value: value as string
            };

            const imageUrl = tryGetValue(index, imageIndex);
            const y = tryGetValue(index, yIndex);

            const selectionId = host.createSelectionIdBuilder()
                .withCategory(category, index)
                .createSelectionId();

            return {
                category: value as string,
                value: y || 0,
                imageUrl: imageUrl as (string | undefined),
                tooltipInfo: [tooltip],
                selected: false,
                identity: selectionId,
                color: host.colorPalette.getColor(value as string).value
            };
        });

        const minY = (settings.valueAxis.minValue !== null) && (settings.valueAxis.minValue < maxValue)
            ? settings.valueAxis.minValue
            : minValue;

        const maxY = (settings.valueAxis.maxValue !== null) && (settings.valueAxis.maxValue > minValue)
            ? settings.valueAxis.maxValue
            : maxValue;

        const valueMetadata = tryGetMetadataColumn(dataView, "Y")!;

        return {
            categoryMetadata: categoryMetadata,
            valueMetadata: valueMetadata,
            minY: minY,
            maxY: maxY,
            settings: settings,
            dataPoints: dataPoints,
            valueLabelFormatter: formatting.valueFormatter.create({
                format: formatting.valueFormatter.getFormatStringByColumn(valueMetadata, true),
                value: settings.valueAxis.displayUnits,
                precision: settings.valueAxis.precision
            }),
            categoryLabelFormatter: formatting.valueFormatter.create({
                format: formatting.valueFormatter.getFormatStringByColumn(categoryMetadata, true),
                value: settings.categoryAxis.displayUnits,
                precision: settings.categoryAxis.precision
            })
        };
    }

}
