"""
测试导入功能
运行此脚本可以验证import_handler模块是否正常工作
"""
import sys
sys.path.insert(0, __file__.rsplit('\\', 1)[0] if '\\' in __file__ else '.')

from import_handler import FilenameParser, parse_artist_info_from_filename

def test_regex_parsing():
    """测试正则解析"""
    print("=" * 60)
    print("测试1: 正则解析")
    print("=" * 60)

    filename = "@akakura,_1.png"
    pattern = "@([^,]+),"

    print(f"文件名: {filename}")
    print(f"正则模式: {pattern}")

    parser = FilenameParser()
    result = parser.parse_regex(filename, pattern)

    if result:
        print(f"✅ 解析成功: {result}")
    else:
        print(f"❌ 解析失败")

    print()

def test_auto_create():
    """测试自动创建"""
    print("=" * 60)
    print("测试2: 自动创建画师")
    print("=" * 60)

    filename = "@akakura,_1.png"

    print(f"文件名: {filename}")

    parser = FilenameParser()
    result = parser.parse_auto_create(filename)

    if result:
        print(f"✅ 解析成功: {result}")
    else:
        print(f"❌ 解析失败")

    print()

def test_parse_artist_info():
    """测试完整的画师信息解析"""
    print("=" * 60)
    print("测试3: 完整画师信息解析（正则模式）")
    print("=" * 60)

    filename = "@akakura,_1.png"
    config = {
        "mode": "custom",
        "parseStrategy": "regex",
        "defaultCategoryId": "root",
        "regexPattern": "@([^,]+),",
        "autoCreateArtist": True,
        "urlDecode": False
    }

    print(f"文件名: {filename}")
    print(f"配置: {config}")

    artist_name, display_name, error_msg, will_create = parse_artist_info_from_filename(filename, config)

    if artist_name:
        print(f"✅ 解析成功")
        print(f"  画师名: {artist_name}")
        print(f"  显示名: {display_name}")
        print(f"  是否创建: {will_create}")
    else:
        print(f"❌ 解析失败: {error_msg}")

    print()

def test_parse_artist_info_auto_create():
    """测试自动创建模式"""
    print("=" * 60)
    print("测试4: 完整画师信息解析（自动创建模式）")
    print("=" * 60)

    filename = "@akakura,_1.png"
    config = {
        "mode": "custom",
        "parseStrategy": "auto_create",
        "defaultCategoryId": "root",
        "autoCreateArtist": True,
        "urlDecode": False
    }

    print(f"文件名: {filename}")
    print(f"配置: {config}")

    artist_name, display_name, error_msg, will_create = parse_artist_info_from_filename(filename, config)

    if artist_name:
        print(f"✅ 解析成功")
        print(f"  画师名: {artist_name}")
        print(f"  显示名: {display_name}")
        print(f"  是否创建: {will_create}")
    else:
        print(f"❌ 解析失败: {error_msg}")

    print()

if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("Artist Gallery 导入功能测试")
    print("=" * 60 + "\n")

    try:
        test_regex_parsing()
        test_auto_create()
        test_parse_artist_info()
        test_parse_artist_info_auto_create()

        print("=" * 60)
        print("所有测试完成")
        print("=" * 60)

    except Exception as e:
        print(f"\n❌ 测试出错: {e}")
        import traceback
        traceback.print_exc()
