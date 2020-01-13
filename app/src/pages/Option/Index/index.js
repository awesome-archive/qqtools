import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import { Link } from 'react-router-dom';
import { createSelector, createStructuredSelector } from 'reselect';
import { Affix, Table, Button, Popconfirm, Modal, message } from 'antd';
import classNames from 'classnames';
import $ from 'jquery';
import style from './style.sass';
import publicStyle from '../../../components/publicStyle/public.sass';
import { optionList, cursorOption, deleteOption, importOption } from '../reducer/reducer';
const path = global.require('path');
const fs = global.require('fs');

/* 初始化数据 */
const state = createStructuredSelector({
  optionList: createSelector( // 配置列表
    ($$state) => $$state.has('option') ? $$state.get('option') : null,
    ($$data) => $$data !== null ? $$data.get('optionList').toJS() : []
  )
});

/* actions */
const actions = (dispatch) => ({
  action: bindActionCreators({
    optionList,
    cursorOption,
    deleteOption,
    importOption
  }, dispatch)
});

@connect(state, actions)
class Index extends Component {
  static propTypes = {
    optionList: PropTypes.array,
    action: PropTypes.objectOf(PropTypes.func)
  };

  constructor() {
    super(...arguments);

    this.state = {
      visible1: false,
      visible2: false
    };
  }

  columns() {
    return [
      {
        title: '配置名称',
        dataIndex: 'name',
        key: 'name',
        width: '25%'
      },
      {
        title: 'QQ号',
        dataIndex: 'qqNumber',
        key: 'qqNumber',
        width: '25%'
      },
      {
        title: '监听群号',
        dataIndex: 'groupNumber',
        key: 'groupNumber',
        width: '25%'
      },
      {
        title: '操作',
        key: 'handle',
        width: '25%',
        render: (value, item, index) => {
          return [
            <Link key="link" to={{
              pathname: '/Option/Edit',
              query: {
                detail: item
              }
            }}>
              <Button className={ style.mr10 } size="small">修改</Button>
            </Link>,
            <Popconfirm key="delete" title="确认要删除该配置项吗？" onConfirm={ this.handleDeleteOptionClick.bind(this, item) }>
              <Button type="danger" size="small">删除</Button>
            </Popconfirm>
          ];
        }
      }
    ];
  }

  componentDidMount() {
    this.props.action.cursorOption({
      query: {
        indexName: 'time'
      }
    });
  }

  // 删除
  async handleDeleteOptionClick(item, event) {
    try {
      const index = this.props.optionList.indexOf(item);

      await this.props.action.deleteOption({
        query: item.name
      });
      this.props.optionList.splice(index, 1);
      this.props.action.optionList({
        optionList: this.props.optionList.slice()
      });
    } catch (err) {
      console.error(err);
    }
  }

  // 显示弹出层
  handleModalDisplayClick(key, value, event) {
    this.setState({
      [key]: value
    });
  }

  // 导入配置
  handleExportConfigurationClick(event) {
    const files = $('#exportConfiguration').val();

    if (files === '') {
      message.error('必须选择一个保存位置！');

      return void 0;
    }

    const { ext } = path.parse(files);

    if (ext !== '.json') {
      message.error('导出的必须是一个json文件！');

      return void 0;
    }

    const jsonStr = JSON.stringify({
      configuration: this.props.optionList
    }, null, 2);

    fs.writeFile(files, jsonStr, (err) => {
      if (err) {
        message.error('导出失败！');
      } else {
        message.success('导出成功');
        this.handleModalDisplayClick('visible1', false);
      }
    });
  }
  handleImportConfigurationClick(event) {
    const files = $('#importConfiguration').val();

    if (files === '') {
      message.error('必须选择一个文件！');

      return false;
    }
    const { ext } = path.parse(files);

    if (ext !== '.json') {
      message.error('导入的必须是一个json文件！');

      return false;
    }
    fs.readFile(files, {
      encoding: 'utf8'
    }, async (err, chunk) => {
      if (err) {
        message.error('导入失败');
      } else {
        const data = JSON.parse(chunk);

        if ('configuration' in data) {
          try {
            await this.props.action.importOption({
              data: data.configuration
            });
            await this.props.action.cursorOption({
              query: {
                indexName: 'time'
              }
            });
            message.success('导入成功');
            this.handleModalDisplayClick('visible2', false);
          } catch (err) {
            console.error(err);
            message.error('导入失败！');
          }
        }
      }
    });
  }

  render() {
    return [
      <Affix key="affix" className={ publicStyle.affix }>
        <div className={ classNames(publicStyle.toolsBox, 'clearfix') }>
          <div className={ publicStyle.fl }>
            <Link className={ style.mr10 } to="/Option/Edit">
              <Button type="primary" icon="plus-circle-o">添加新配置</Button>
            </Link>
            <Button className={ style.mr10 }
              icon="export"
              onClick={ this.handleModalDisplayClick.bind(this, 'visible1', true) }
            >
              导出所有配置
            </Button>
            <Button icon="select" onClick={ this.handleModalDisplayClick.bind(this, 'visible2', true) }>导入所有配置</Button>
          </div>
          <div className={ publicStyle.fr }>
            <Link className={ publicStyle.ml10 } to="/">
              <Button type="danger" icon="poweroff">返回</Button>
            </Link>
          </div>
        </div>
      </Affix>,
      /* 显示列表 */
      <div key="tableBox" className={ publicStyle.tableBox }>
        <Table dataSource={ this.props.optionList }
          columns={ this.columns() }
          bordered={ true }
          rowKey={ (item) => item.time }
          pagination={{
            pageSize: 20,
            showQuickJumper: true
          }}
        />
      </div>,
      /* 导出配置 */
      <Modal key="modal1"
        title="导出配置"
        visible={ this.state.visible1 }
        onOk={ this.handleExportConfigurationClick.bind(this) }
        onCancel={ this.handleModalDisplayClick.bind(this, 'visible1', false) }
      >
        <input id="exportConfiguration" type="file" nwsaveas={ `backup_${ new Date().getTime() }.json` } />
      </Modal>,
      /* 导入配置 */
      <Modal key="modal2"
        title="导入配置"
        visible={ this.state.visible2 }
        onOk={ this.handleImportConfigurationClick.bind(this) }
        onCancel={ this.handleModalDisplayClick.bind(this, 'visible2', false) }
      >
        <p className={ style.tishi }>同一配置名称会覆盖原有的配置。</p>
        <input id="importConfiguration" type="file" />
      </Modal>
    ];
  }
}

export default Index;