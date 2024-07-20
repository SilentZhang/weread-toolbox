import type { PlasmoCSConfig } from "plasmo";
import { getCurrentTimestamp, sleep } from "./content-utils";
import { Button, Form, Input, Modal, Tooltip, Typography, notification } from "antd";
import { useEffect, useState } from "react";
import { QuestionCircleOutlined } from '@ant-design/icons';
import saveAs from 'file-saver';

import './content-export.css';
import { exportBookMarks } from "~core/core-export-local";
import { fetchShelfData } from "~core/core-weread-api";
import JSZip from "jszip";


export const config: PlasmoCSConfig = {
    matches: ["*://weread.qq.com/web/shelf"],
    run_at: "document_idle",
};

export const getRootContainer = async () => {
    let container;
    for (let retryCount = 0; retryCount < 50 && !container; retryCount++) {
        await sleep(200)
        container = document.querySelector('.shelf_download_app');
        console.log('container', container);
    }
    const menuContainer = document.createElement('div');
    container.insertAdjacentElement('beforebegin', menuContainer);
    return menuContainer;
};

const Exporter: React.FC = () => {
    const [isExportToLocalModalOpen, setIsExportToLocalModalOpen] = useState(false);
    const [isExportToNotionModalOpen, setIsExportToNotionModalOpen] = useState(false);
    const [form] = Form.useForm();
    const [api, contextHolder] = notification.useNotification();

    useEffect(() => {
        // 监听 service worker 消息
        chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
            api[msg.type]({
                key: msg.key,
                message: msg.title,
                description: msg.content,
                duration: null,
            });
            sendResponse({ succ: 1 });
        });
    }, []);

    async function showExportToNotionModal() {
        setIsExportToNotionModalOpen(true);
        chrome.storage.local.get(
            ["databaseUrl", "notionToken"],
            (result) => {
                const { databaseUrl, notionToken } = result;
                if (databaseUrl) {
                    form.setFieldsValue({ databaseUrl });
                }
                if (notionToken) {
                    form.setFieldsValue({ notionToken });
                }
            }
        );
    };

    async function onClickExportAllToNotion() {
        setIsExportToNotionModalOpen(false);
        const { databaseUrl, notionToken } = form.getFieldsValue();
        if (!databaseUrl || !notionToken) {
            api['error']({ key: 'export', message: '全量导出微信读书笔记', description: '请先查看使用说明，设置 Notion Database ID, Notion Token！', duration: null });
            return;
        }
        console.log('onClickExportAllToLocal', databaseUrl, notification);
        chrome.runtime.sendMessage({ type: "exportAllToNotion", databaseUrl: databaseUrl, notionToken: notionToken }, (resp) => { console.log('exportAllToNotion', resp); });
    }

    async function onClickExportAllToLocal() {
        setIsExportToLocalModalOpen(false);
        const zip = new JSZip()
        let noMarkCount = 0;
        try {
            const shelf = await fetchShelfData();
            console.log('export all to local, books', shelf.books.length);
            for (let i = 0; i < shelf.books.length; i++) {
                const book = shelf.books[i];
                try {
                    api['info']({ key: 'exportAllToLocal', message: '全量导出微信读书笔记', description: `正在导出《${book.title}》，当前进度 ${i + 1} / ${shelf.books.length} ，导出完成前请勿关闭或刷新本页面，`, duration: null, });
                    const content = await exportBookMarks(book.bookId, book.title, false);
                    if (content && !content.includes("没有任何笔记")) {
                        zip.file(`${book.title}.md`, content);
                    } else {
                        noMarkCount++;
                    }
                } catch (error) {
                    console.error("export single to local error:", book.title, error);
                }
            }
            const f = await zip.generateAsync({ type: 'blob' });
            api['success']({ key: 'exportAllToLocal', message: '全量导出微信读书笔记', description: `导出完成，共处理 ${shelf.books.length} 本书籍，其中 ${noMarkCount} 本书籍没有笔记，成功导出 ${shelf.books.length - noMarkCount} 篇笔记。`, duration: null, });
            saveAs(f, `weread-toolbox-export-${getCurrentTimestamp()}.zip`);
        } catch (error) {
            api['error']({ key: 'exportAllToLocal', message: '全量导出微信读书笔记', description: `导出失败，可联系三此君，反馈异常详情！${error}`, duration: null, })
            console.error("export all to local error:", error);
            return false;
        }
    }

    return (
        <>
            {contextHolder}
            <Button onClick={() => setIsExportToLocalModalOpen(true)} shape="round" type="text" className="shelf_download_app" style={{ marginRight: 10 }}>全量下载笔记</Button>
            <Button onClick={showExportToNotionModal} shape="round" type="text" className="shelf_download_app">全量笔记同步Notion</Button>
            <Modal title="全量下载微信读书笔记" open={isExportToLocalModalOpen} onOk={onClickExportAllToLocal} okText="下载" onCancel={() => setIsExportToLocalModalOpen(false)} cancelText="取消" >
                <Typography.Paragraph>全量导出微信读书笔记，只会导出你的书架中有笔记的书籍。</Typography.Paragraph>
                <Typography.Paragraph>有任何问题可以在插件关于页面联系三此君反馈问题，感谢支持。</Typography.Paragraph>
            </Modal>
            <Modal title="全量同步微信读书笔记" open={isExportToNotionModalOpen} onOk={onClickExportAllToNotion} okText="同步 Notion" onCancel={() => setIsExportToNotionModalOpen(false)} cancelText="取消" >
                <Typography.Paragraph>全量同步微信读书笔记，只会同步你的书架中有笔记的书籍。</Typography.Paragraph>
                <Typography.Paragraph>有任何问题可以在插件关于页面联系三此君反馈问题，感谢支持。</Typography.Paragraph>
                <Form form={form} labelCol={{ span: 6 }} wrapperCol={{ span: 16 }}>
                    <Form.Item
                        label={
                            <span>
                                Database Link&nbsp;
                                <Tooltip title="点击关于->使用说明，查看如何获取 Database Link">
                                    <QuestionCircleOutlined />
                                </Tooltip>
                            </span>
                        }
                        name="databaseUrl"
                        rules={[{ required: true, message: "Please enter the Database Link" }]}
                    >
                        <Input placeholder="请输入 Database Link" />
                    </Form.Item>
                    <Form.Item
                        label={
                            <span>
                                Notion Token&nbsp;
                                <Tooltip title="点击关于->使用说明，查看如何获取 Notion Token">
                                    <QuestionCircleOutlined />
                                </Tooltip>
                            </span>
                        }
                        name="notionToken"
                        rules={[{ required: true, message: "Please enter the Notion Token" }]}
                    >
                        <Input.Password placeholder="请输入 Notion Token" />
                    </Form.Item>
                </Form>

            </Modal>
        </>
    )
}

export default Exporter;