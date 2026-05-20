import { describe, expect, it } from "vitest";

import combineWrappers, { wrp } from "../combine-wrappers";

describe("combineWrappers", () => {
  it("returns a function component with the given displayName", () => {
    const Component = ({ children }: { children: React.ReactNode }) => children as any;
    const combined = combineWrappers("MyProviders", [wrp(Component as any)]);

    expect(typeof combined).toBe("function");
    expect(combined.displayName).toBe("MyProviders");
  });

  it("returns a function for an empty wrappers array", () => {
    const combined = combineWrappers("Empty", []);
    expect(typeof combined).toBe("function");
    expect(combined.displayName).toBe("Empty");
  });
});

describe("wrp", () => {
  it("creates a WrapperItem with Wrapper and props", () => {
    const MyComponent = () => null;
    const item = wrp(MyComponent, { foo: "bar" } as any);

    expect(item.Wrapper).toBe(MyComponent);
    expect(item.props).toEqual({ foo: "bar" });
  });

  it("defaults props to undefined", () => {
    const MyComponent = () => null;
    const item = wrp(MyComponent);
    expect(item.props).toBeUndefined();
  });
});
