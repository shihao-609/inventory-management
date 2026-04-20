// components/position-picker/position-picker.js
/**
 * 位置选择组件
 * 功能：四级联动选择（楼层 → 类型 → 编号 → 层）
 * 支持：微信小程序
 */
const { supabase, TABLES } = require('../../utils/supabase.js');

Component({
  properties: {
    // 是否显示弹窗
    show: {
      type: Boolean,
      value: false
    },
    // 当前位置值（用于编辑时回显）
    value: {
      type: String,
      value: ''
    }
  },

  data: {
    // 配置数据
    positionConfig: [],      // 所有楼层配置
    floors: [],              // 楼层列表
    types: [],               // 当前楼层的类型列表
    numbers: [],             // 当前类型的编号列表
    layers: [],               // 当前类型的层选项

    // 选中索引
    selectedFloorIndex: 0,
    selectedTypeIndex: 0,
    selectedNumberIndex: 0,
    selectedLayerIndex: 0,

    // picker-view 使用的值数组 [floorIndex, typeIndex, numberIndex, layerIndex]
    pickerValue: [0, 0, 0],

    // 显示状态
    showLayerPicker: false,  // 是否显示层选择器
    previewCode: '',         // 预览编码
    loading: false,           // 加载状态
    isChanging: false        // 是否正在滚动中
  },

  observers: {
    'show': function (show) {
      if (show) {
        this.loadPositionConfig();
        this.parseInitialValue();
      }
    }
  },

  methods: {
    // 加载位置配置
    async loadPositionConfig() {
      if (this.data.loading) return;
      this.setData({ loading: true });

      try {
        // 使用 Supabase 获取位置配置
        const config = await supabase.select(TABLES.POSITION_CONFIG, {
          order: 'sort_order.asc'
        });

        if (config && config.length > 0) {
          // 转换 snake_case 字段为驼峰命名
          const processedConfig = config.map(item => {
            // 处理 enabledTypes 数组中的字段转换
            const enabledTypes = (item.enabled_types || item.enabledTypes || []).map(type => ({
              typeKey: type.type_key || type.typeKey,
              typeName: type.type_name || type.typeName,
              numberPrefix: type.number_prefix || type.numberPrefix,
              numberRange: type.number_range || type.numberRange || [],
              hasLayer: type.has_layer !== undefined ? type.has_layer : type.hasLayer,
              layerOptions: type.layer_options || type.layerOptions || []
            }));

            return {
              floor: item.floor,
              floorName: item.floor_name || item.floorName,
              sortOrder: item.sort_order || item.sortOrder,
              enabledTypes: enabledTypes
            };
          });

          const floors = processedConfig.map(item => ({
            floor: item.floor,
            floorName: item.floorName,
            sortOrder: item.sortOrder
          }));

          this.setData({
            positionConfig: processedConfig,
            floors: floors,
            pickerValue: [0, 0, 0]
          }, () => {
            // setData 完成后初始化第一个楼层
            if (floors.length > 0) {
              this.updateTypesForFloor(0, () => {
                this.updatePreviewCode();
                console.log('[position-picker] 初始化完成, previewCode:', this.data.previewCode);
              });
            }
          });
        } else {
          console.error('[position-picker] 获取配置失败: 数据为空');
          wx.showToast({
            title: '加载位置配置失败',
            icon: 'none'
          });
        }
      } catch (error) {
        console.error('[position-picker] 加载位置配置失败', error);
        wx.showToast({
          title: '加载位置配置失败',
          icon: 'none'
        });
      } finally {
        this.setData({ loading: false });
      }
    },

    // 解析初始值（如编辑时）
    parseInitialValue() {
      const { value, positionConfig } = this.data;
      if (!value || positionConfig.length === 0) return;

      // 格式: 1F-H03-L2 或 1F-DA区
      const match = value.match(/^([^-]+)-([^-]+)(?:-L(\d+))?$/);
      if (!match) return;

      const [, floorCode, numPart, layerIndex] = match;
      const floorIndex = positionConfig.findIndex(f => f.floor === floorCode);

      if (floorIndex >= 0) {
        this.setData({ selectedFloorIndex: floorIndex });
        this.updateTypesForFloor(floorIndex, () => {
          // 根据 numPart 匹配类型和编号
          const types = this.data.types;
          for (let ti = 0; ti < types.length; ti++) {
            const type = types[ti];
            if (numPart.startsWith(type.numberPrefix)) {
              const numPartAfterPrefix = numPart.substring(type.numberPrefix.length);
              const numIndex = type.numberRange.indexOf(numPartAfterPrefix);

              this.setData({ selectedTypeIndex: ti });
              this.updateNumbersAndLayersForType(ti, () => {
                if (numIndex >= 0) {
                  this.setData({ selectedNumberIndex: numIndex });
                }
                if (layerIndex && this.data.showLayerPicker) {
                  const layerIdx = parseInt(layerIndex) - 1;
                  if (layerIdx >= 0 && layerIdx < this.data.layers.length) {
                    this.setData({ selectedLayerIndex: layerIdx });
                  }
                }
                this.updatePreviewCode();
              });
              return;
            }
          }
          this.updatePreviewCode();
        });
      }
    },

    // 根据楼层更新类型列表
    updateTypesForFloor(floorIndex, callback) {
      const config = this.data.positionConfig[floorIndex];
      if (!config) return;

      const types = config.enabledTypes || [];
      const firstType = types.length > 0 ? types[0] : null;
      const showLayer = firstType ? (firstType.hasLayer || false) : false;
      
      this.setData({
        selectedFloorIndex: floorIndex,
        types: types,
        numbers: firstType ? (firstType.numberRange || []) : [],
        layers: firstType ? (firstType.layerOptions || []) : [],
        showLayerPicker: showLayer,
        selectedTypeIndex: 0,
        selectedNumberIndex: 0,
        selectedLayerIndex: 0,
        pickerValue: this.buildPickerValue(floorIndex, 0, 0, 0, showLayer)
      }, callback);
    },

    // 根据类型更新编号和层列表
    updateNumbersAndLayersForType(typeIndex, callback) {
      const type = this.data.types[typeIndex];
      if (!type) return;

      const showLayer = type.hasLayer || false;

      this.setData({
        selectedTypeIndex: typeIndex,
        numbers: type.numberRange || [],
        layers: type.layerOptions || [],
        showLayerPicker: showLayer,
        selectedNumberIndex: 0,
        selectedLayerIndex: 0,
        pickerValue: this.buildPickerValue(this.data.selectedFloorIndex, typeIndex, 0, 0, showLayer)
      }, callback);
    },

    // picker-view 滚动事件
    onPickerChange(e) {
      const value = e.detail.value;
      const oldFloorIndex = this.data.selectedFloorIndex;
      const oldTypeIndex = this.data.selectedTypeIndex;
      const oldNumberIndex = this.data.selectedNumberIndex;

      const newFloorIndex = value[0] || 0;
      const newTypeIndex = value[1] || 0;
      const newNumberIndex = value[2] || 0;
      const newLayerIndex = this.data.showLayerPicker ? (value[3] || 0) : 0;

      // 如果楼层变化，重置类型和编号
      if (newFloorIndex !== oldFloorIndex) {
        this.updateTypesForFloor(newFloorIndex, () => {
          // 类型变化后，重新设置编号
          const newTypes = this.data.types;
          const newTypeIndex = Math.min(newTypeIndex, newTypes.length - 1);
          this.updateNumbersAndLayersForType(newTypeIndex, () => {
            const newNumbers = this.data.numbers;
            const finalNumberIndex = Math.min(newNumberIndex, newNumbers.length - 1);
            this.setData({
              selectedFloorIndex: newFloorIndex,
              selectedTypeIndex: newTypeIndex,
              selectedNumberIndex: finalNumberIndex,
              selectedLayerIndex: newLayerIndex,
              pickerValue: this.buildPickerValue(newFloorIndex, newTypeIndex, finalNumberIndex, newLayerIndex, this.data.showLayerPicker)
            });
            this.updatePreviewCode();
          });
        });
      }
      // 如果类型变化，重置编号
      else if (newTypeIndex !== oldTypeIndex) {
        this.updateNumbersAndLayersForType(newTypeIndex, () => {
          const newNumbers = this.data.numbers;
          const finalNumberIndex = Math.min(newNumberIndex, newNumbers.length - 1);
          this.setData({
            selectedTypeIndex: newTypeIndex,
            selectedNumberIndex: finalNumberIndex,
            selectedLayerIndex: newLayerIndex,
            pickerValue: this.buildPickerValue(newFloorIndex, newTypeIndex, finalNumberIndex, newLayerIndex, this.data.showLayerPicker)
          });
          this.updatePreviewCode();
        });
      }
      // 编号或层变化
      else {
        this.setData({
          selectedNumberIndex: newNumberIndex,
          selectedLayerIndex: newLayerIndex,
          pickerValue: value
        });
        this.updatePreviewCode();
      }
    },

    // 构建 picker-value 数组
    buildPickerValue(floorIndex, typeIndex, numberIndex, layerIndex, showLayer) {
      const arr = [floorIndex, typeIndex, numberIndex];
      if (showLayer !== false && layerIndex !== undefined) {
        arr.push(layerIndex);
      }
      return arr;
    },

    // 更新预览编码
    updatePreviewCode() {
      const {
        positionConfig,
        floors,
        types,
        numbers,
        layers,
        selectedFloorIndex,
        selectedTypeIndex,
        selectedNumberIndex,
        selectedLayerIndex,
        showLayerPicker
      } = this.data;

      console.log('[position-picker] updatePreviewCode - floors:', floors.length, 'types:', types.length, 'numbers:', numbers.length);

      if (floors.length === 0 || types.length === 0) {
        console.log('[position-picker] updatePreviewCode - 数据为空，无法生成编码');
        this.setData({ previewCode: '' });
        return;
      }

      const floor = floors[selectedFloorIndex];
      const type = types[selectedTypeIndex];
      const number = numbers[selectedNumberIndex] || '';

      if (!floor || !type) {
        this.setData({ previewCode: '' });
        return;
      }

      // 构建编码: 楼层 + "-" + 前缀 + 编号
      let code = floor.floor + '-' + type.numberPrefix + number;

      // 如果有层选项，追加层信息
      if (showLayerPicker && layers.length > 0) {
        const layerOption = layers[selectedLayerIndex];
        // 计算层索引：第1层=1, 第2层=2, ..., 顶层=layerOptions.length-1, 整架=layerOptions.length
        // 例如: ["第1层","第2层","第3层","顶层","整架"]
        //       [0]     [1]     [2]     [3]     [4]
        // 对应索引: 1     2      3      4       5
        let layerSuffix;
        const totalOptions = type.layerOptions ? type.layerOptions.length : 0;
        if (layerOption === '整架') {
          layerSuffix = totalOptions; // 整架用总数作为索引
        } else {
          layerSuffix = selectedLayerIndex + 1; // 第N层用 N
        }
        code += '-L' + layerSuffix;
      }

      this.setData({ previewCode: code });
    },

    // 关闭弹窗
    onCancel() {
      this.triggerEvent('cancel');
    },

    // 确认选择
    onConfirm() {
      const {
        previewCode,
        floors,
        types,
        numbers,
        layers,
        selectedFloorIndex,
        selectedTypeIndex,
        selectedNumberIndex,
        selectedLayerIndex,
        showLayerPicker,
        positionConfig
      } = this.data;

      console.log('[position-picker] onConfirm - previewCode:', previewCode);
      console.log('[position-picker] onConfirm - floors:', floors.length, 'types:', types.length, 'numbers:', numbers.length);

      if (!previewCode || previewCode.length < 3) {
        wx.showToast({
          title: '请选择完整位置',
          icon: 'none'
        });
        return;
      }

      // 获取选中楼层的完整配置
      const floorConfig = positionConfig[selectedFloorIndex];

      // 构建完整结果
      const result = {
        // 最终编码
        code: previewCode,
        // 楼层信息
        floor: floors[selectedFloorIndex].floor,
        floorName: floors[selectedFloorIndex].floorName,
        // 类型信息
        typeKey: types[selectedTypeIndex].typeKey,
        typeName: types[selectedTypeIndex].typeName,
        // 编号
        number: numbers[selectedNumberIndex],
        // 层信息（如果有）
        layer: showLayerPicker && layers.length > 0 ? layers[selectedLayerIndex] : null,
        layerIndex: showLayerPicker ? selectedLayerIndex + 1 : null,
        // 原始配置
        _floorConfig: floorConfig,
        _typeConfig: types[selectedTypeIndex]
      };

      this.triggerEvent('confirm', result);
    }
  }
});
